open Paper_market

(* This executable trades PAPER only. The strategy is an uncalibrated systems
   demonstration. No backtest or paper P&L supports a profitability claim. *)

let state_dir =
  match Sys.getenv_opt "PAPER_STATE_DIR" with
  | Some s when s <> "" -> s
  | _ -> ".paper-state"

let pending_path = Filename.concat state_dir "pending"
let owned_path = Filename.concat state_dir "owned"
let buy_budget_path = Filename.concat state_dir "buy-budget"
let event_path = Filename.concat state_dir "events.jsonl"

let read_line path =
  if not (Sys.file_exists path) then None
  else
    let ic = open_in path in
    Fun.protect ~finally:(fun () -> close_in_noerr ic) (fun () -> Some (input_line ic))

let write_atomic path value =
  let temp = path ^ ".tmp" in
  let oc = open_out_bin temp in
  output_string oc (value ^ "\n");
  flush oc;
  Unix.fsync (Unix.descr_of_out_channel oc);
  close_out oc;
  Unix.rename temp path

let remove_if_exists path = if Sys.file_exists path then Sys.remove path

let utc_date () =
  let tm = Unix.gmtime (Unix.time ()) in
  Printf.sprintf "%04d-%02d-%02d" (tm.tm_year + 1900) (tm.tm_mon + 1)
    tm.tm_mday
  (* # SOURCE: Unix tm_year counts from 1900; tm_mon starts at zero. *)

let buy_spent_today () =
  match read_line buy_budget_path with
  | None -> Ok 0.
  | Some line ->
    (match String.split_on_char ' ' line with
     | [ date; value ] ->
       (try
          let spent = float_of_string value in
          if not (Float.is_finite spent) || spent < 0. then
            Error "buy budget record invalid"
          else if date = utc_date () then Ok spent else Ok 0.
        with _ -> Error "buy budget record malformed")
     | _ -> Error "buy budget record malformed")

let log fmt =
  Printf.ksprintf (fun s ->
    let tm = Unix.gmtime (Unix.time ()) in
    let timestamp = Printf.sprintf "%04d-%02d-%02dT%02d:%02d:%02dZ"
      (tm.tm_year + 1900) (tm.tm_mon + 1) tm.tm_mday
      tm.tm_hour tm.tm_min tm.tm_sec in
    Printf.printf "%s %s\n%!" timestamp s;
    let row = Yojson.Safe.to_string (`Assoc [
      "at", `String timestamp; "message", `String s ]) in
    (* # SOURCE: append-only, owner-only local event journal; fsync before
       submitting another paper order. *)
    let oc = open_out_gen [ Open_creat; Open_append; Open_wronly ] 0o600 event_path in
    Fun.protect ~finally:(fun () -> close_out_noerr oc) (fun () ->
      output_string oc (row ^ "\n");
      flush oc;
      Unix.fsync (Unix.descr_of_out_channel oc))) fmt
  (* # SOURCE: Unix tm_year counts from 1900; tm_mon starts at zero. *)

let client_id side timestamp =
  let clean = String.to_seq timestamp
    |> Seq.filter (function '0' .. '9' | 'A' .. 'Z' | 'a' .. 'z' -> true | _ -> false)
    |> String.of_seq in
  "jsbotbtc" ^ side ^ clean

let filled_qty j =
  match Paper_broker.float (Paper_broker.member "filled_qty" j) with
  | Some x when Float.is_finite x && x >= 0. -> x
  | _ -> 0.

let reconcile_pending () =
  match read_line pending_path with
  | None -> Ok false
  | Some line ->
    (match String.split_on_char ' ' line with
     | [ side; id ] when side = "buy" || side = "sell" ->
       (match Paper_broker.order_by_client_id id with
        | Error e -> Error ("pending order unresolved: " ^ e)
        | Ok order ->
          (match Paper_broker.order_status order with
           | None -> Error "pending order has no status"
           | Some status ->
             log "reconcile id=%s side=%s status=%s filled_qty=%.9f"
               id side status (filled_qty order);
             if List.mem status [ "filled"; "canceled"; "expired"; "rejected" ] then (
               if side = "buy" && filled_qty order > 0. then
                 write_atomic owned_path id;
               if side = "sell" && status = "filled" then
                 remove_if_exists owned_path;
               remove_if_exists pending_path;
               Ok false)
             else Ok true))
     | _ -> Error "pending journal malformed")

let broker_state () =
  match Paper_broker.account (), Paper_broker.positions (),
        Paper_broker.any_open_order (), Paper_broker.price_increment () with
  | Error e, _, _, _ | _, Error e, _, _ | _, _, Error e, _
  | _, _, _, Error e -> Error e
  | Ok (status, blocked, buying_power), Ok position_qty,
    Ok has_open_order, Ok tick ->
    if not (List.mem status [ "ACTIVE"; "PAPER_ONLY" ]) || blocked then
      Error ("paper account not tradable: " ^ status)
    else Ok (buying_power, position_qty, has_open_order, tick)

let try_order (previous : Paper_crypto.quote) (current : Paper_crypto.quote) =
  match reconcile_pending () with
  | Error e -> log "HALT %s" e
  | Ok true -> log "HOLD pending order is still open"
  | Ok false ->
    (match broker_state () with
     | Error e -> log "HALT broker state: %s" e
     | Ok (buying_power, position_qty, has_open_order, tick) ->
       let owned = read_line owned_path <> None in
       if position_qty > 0. && not owned then
         log "HALT existing BTC position is not owned by this bot"
       else if position_qty = 0. && owned then
         log "HALT ownership marker present but BTC position is zero"
       else
         let owned_dust = owned && position_qty > 0.
           && Paper_crypto.is_dust ~price:current.ask ~qty:position_qty in
         let decision_qty = if owned_dust then 0. else position_qty in
         let action = Paper_crypto.decide ~previous ~current ~position_qty:decision_qty
             ~has_open_order in
         let side_qty_price =
           match action with
           | Paper_crypto.Hold reason -> log "HOLD %s" reason; None
           | Paper_crypto.Buy ->
             (* # GUESS: $20 diagnostic order size; calibrate with actual
                spreads, fees and fill data. # UNCALIBRATED GUESS *)
             if buying_power < 20. then (log "HOLD buying power below $20"; None)
             else Option.map (fun q -> "buy", q,
               ceil (current.ask /. tick) *. tick)
                 (Paper_crypto.buy_qty ~ask:current.ask)
           | Paper_crypto.Sell ->
             (* # SOURCE: user specified $30 maximum order size. *)
             if position_qty *. current.bid > 30. then
               (log "HALT BTC position above user $30 order cap"; None)
             else if Paper_crypto.is_dust ~price:current.bid ~qty:position_qty then
               (log "HOLD owned BTC position below Alpaca $10 sell minimum"; None)
             else Some ("sell", position_qty,
               floor (current.bid /. tick) *. tick)
         in
         (match side_qty_price with
          | None -> ()
          | Some (side, qty, price) ->
            (match buy_spent_today () with
             | Error e -> log "HALT %s" e
             | Ok spent ->
               let notional = qty *. price in
               (* # SOURCE: user-stated $300 capital per bot; buy attempts
                  consume the daily budget even if later rejected. *)
               if side = "buy" && spent +. notional > 300. then
                 log "HOLD daily paper buy-attempt budget exhausted"
               else if side = "buy" &&
                 (position_qty *. current.ask +. notional > 30.) then
                 (* # SOURCE: user specified $30 maximum paper position/order size. *)
                 log "HOLD new buy would exceed user $30 BTC position cap"
               else (
                 let id = client_id side current.timestamp in
                 if side = "buy" then
                   write_atomic buy_budget_path
                     (utc_date () ^ " " ^ string_of_float (spent +. notional));
                 write_atomic pending_path (side ^ " " ^ id);
                 log "SEND paper %s BTC/USD qty=%.9f limit=%g id=%s" side qty price id;
                 match Paper_broker.submit_ioc ~side ~qty ~limit_price:price
                         ~client_order_id:id with
                 | Error e when String.starts_with ~prefix:"HTTP 422:" e ->
                   (* # SOURCE: HTTP 422 is a definite validation rejection;
                      no order was accepted for this client ID. *)
                   remove_if_exists pending_path;
                   log "REJECTED validation: %s" e
                 | Error e -> log "UNCERTAIN submission: %s; journal retained" e
                 | Ok order ->
                   log "ACK id=%s status=%s" id
                     (Option.value (Paper_broker.order_status order) ~default:"unknown")))))

let shadow_decision (previous : Paper_crypto.quote) (current : Paper_crypto.quote) =
  match broker_state () with
  | Error e -> log "SHADOW unavailable broker_state=%s no_order=true" e
  | Ok (_, position_qty, has_open_order, _) ->
    let owned = read_line owned_path <> None in
    if position_qty > 0. && not owned then
      log "SHADOW blocked existing BTC position is not bot-owned no_order=true"
    else if position_qty = 0. && owned then
      log "SHADOW blocked ownership marker conflicts with broker no_order=true"
    else
      let action = Paper_crypto.decide ~previous ~current ~position_qty
          ~has_open_order in
      let reading = match action with
        | Paper_crypto.Buy -> "hypothetical_buy"
        | Paper_crypto.Sell -> "hypothetical_sell"
        | Paper_crypto.Hold reason -> "hold:" ^ reason in
      (* # SOURCE: monitor mode is read-only; the diagnostic rule is
         uncalibrated and must not be represented as a tradable signal. *)
      log "SHADOW diagnostic=%s quote_time=%s no_order=true uncalibrated=true"
        reading current.timestamp

let run ~trade ~once =
  if not (Sys.file_exists state_dir) then Unix.mkdir state_dir 0o700;
  (* # SOURCE: owner-only directory protects the order journal. *)
  let armed = trade && Sys.getenv_opt "PAPER_ORDERS" = Some "1" in
  log "start mode=%s state=%s" (if armed then "PAPER_ORDER" else "MONITOR") state_dir;
  let rec loop previous =
    let current =
      match Paper_crypto.fetch_quote () with
      | Error e -> log "DATA_ERROR %s" e; None
      | Ok q ->
        log "QUOTE BTC/USD t=%s bid=%g ask=%g spread_bps=%.4f"
          q.timestamp q.bid q.ask (Paper_crypto.spread_bps q);
        Some q
    in
    (match previous, current with
     | Some p, Some q when armed -> try_order p q
     | Some p, Some q -> shadow_decision p q
     | _ -> ());
    if not once then (
      (* # GUESS: 30 seconds keeps the diagnostic loop below typical REST
         polling limits. Measure rate-limit headers and signal stability
         before changing it. # UNCALIBRATED GUESS *)
      Unix.sleep 30;
      loop (match current with Some q -> Some q | None -> previous))
  in
  loop None

let research_once () =
  List.iter (fun symbol ->
    match Pattern_forge.fetch symbol with
    | Error e -> Printf.printf "PATTERN_FORGE_ERROR symbol=%s reason=%s\n" symbol e
    | Ok frames ->
      List.iter (fun (timeframe, result) ->
        match result with
        | Error e ->
          Printf.printf "PATTERN_FORGE_UNAVAILABLE symbol=%s frame=%s reason=%s\n"
            symbol timeframe e
        | Ok (reading : Pattern_forge.reading) ->
          Printf.printf "PATTERN_FORGE symbol=%s venue=Hyperliquid frame=%s close_time_ms=%d close=%g prior_close=%g return_pct=%+.5f read_only=true\n"
            reading.symbol reading.timeframe reading.close_time_ms
            reading.close reading.prior_close reading.return_pct) frames)
    [ "BTC"; "ETH"; "SOL" ]

let () =
  let trade = ref false and once = ref false and check_broker = ref false in
  let check_positions = ref false in
  let research = ref false in
  let check_order = ref None in
  Arg.parse [
    "--paper", Arg.Set trade, "Allow paper orders only with PAPER_ORDERS=1";
    "--once", Arg.Set once, "Fetch one live quote and exit";
    "--check-broker", Arg.Set check_broker, "Read paper account, orders, position and asset";
    "--check-positions", Arg.Set check_positions, "Read paper positions without trading";
    "--research-once", Arg.Set research, "Read Pattern Forge closed-candle context without trading";
    "--check-order", Arg.String (fun id -> check_order := Some id),
      "Read one paper order by client ID and exit";
  ] (fun _ -> ()) "paper_crypto_main [--paper] [--once|--research-once|--check-broker|--check-positions|--check-order ID]";
  if !research then research_once ()
  else if !check_order <> None then
    match !check_order with
    | None -> assert false
    | Some id ->
      (match Paper_broker.order_by_client_id id with
       | Error e -> prerr_endline ("ORDER_CHECK_FAILED " ^ e); exit 1
       | Ok order ->
         Printf.printf "ORDER_CHECK_OK id=%s symbol=%s side=%s status=%s filled_qty=%.9f\n"
           id
           (Option.value (Paper_broker.string (Paper_broker.member "symbol" order)) ~default:"unknown")
           (Option.value (Paper_broker.string (Paper_broker.member "side" order)) ~default:"unknown")
           (Option.value (Paper_broker.order_status order) ~default:"unknown")
           (filled_qty order))
  else if !check_positions then
    (match Paper_broker.get "/v2/positions" with
     | Error e -> prerr_endline ("POSITIONS_CHECK_FAILED " ^ e); exit 1
     | Ok (`List positions) ->
       List.iter (fun p ->
         let field name =
           Option.value (Paper_broker.string (Paper_broker.member name p))
             ~default:"unknown" in
         Printf.printf "POSITION symbol=%s qty=%s side=%s avg_entry_price=%s\n"
           (field "symbol") (field "qty") (field "side")
           (field "avg_entry_price")) positions
     | Ok _ -> prerr_endline "POSITIONS_CHECK_FAILED unexpected response"; exit 1)
  else if !check_broker then
    match broker_state () with
    | Error e -> prerr_endline ("BROKER_CHECK_FAILED " ^ e); exit 1
    | Ok (buying_power, qty, open_order, tick) ->
      Printf.printf "BROKER_CHECK_OK paper buying_power=%.2f btc_qty=%.9f open_orders=%b price_increment=%g\n"
        buying_power qty open_order tick
  else run ~trade:!trade ~once:!once
