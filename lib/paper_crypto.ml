(* A deliberately small live-paper policy. The direction rule is a diagnostic
   heuristic, not a calibrated claim of edge. All prices come from Alpaca's
   current crypto quote endpoint; historical/synthetic values never reach it. *)

type quote = {
  bid : float;
  ask : float;
  bid_size : float;
  ask_size : float;
  timestamp : string;
}

type action = Buy | Sell | Hold of string

let member name = function
  | `Assoc fields -> List.assoc_opt name fields
  | _ -> None

let number = function
  | Some (`Float x) -> Some x
  | Some (`Int x) -> Some (float_of_int x)
  | Some (`String x) -> (try Some (float_of_string x) with _ -> None)
  | _ -> None

let positive_finite x = Float.is_finite x && x > 0.

let parse_quote j =
  let q = Option.bind (member "quotes" j) (member "BTC/USD") in
  match q with
  | None -> Error "BTC/USD quote absent"
  | Some q ->
    (match number (member "bp" q), number (member "ap" q),
           number (member "bs" q), number (member "as" q), member "t" q with
     | Some bid, Some ask, Some bid_size, Some ask_size, Some (`String timestamp)
       when positive_finite bid && positive_finite ask && bid < ask
            && positive_finite bid_size && positive_finite ask_size
            && timestamp <> "" ->
       Ok { bid; ask; bid_size; ask_size; timestamp }
     | _ -> Error "invalid BTC/USD quote fields")

let quote_url =
  "https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=BTC%2FUSD"

let fetch_quote () =
  match Alpaca_http.get_public_json ~url:quote_url with
  | Error e -> Error e
  | Ok j -> parse_quote j

let midpoint q = (q.bid +. q.ask) /. 2.
let spread_bps q = (q.ask -. q.bid) /. midpoint q *. 10_000.
(* # SOURCE: one basis point is 1/10,000, by definition. *)

let decide ~previous ~current ~position_qty ~has_open_order =
  if has_open_order then Hold "broker has an open order"
  else if current.timestamp <= previous.timestamp then Hold "market quote has not advanced"
  else if not (Float.is_finite position_qty) || position_qty < 0. then
    Hold "invalid broker position"
  else if position_qty = 0. && current.bid > previous.ask then Buy
  else if position_qty > 0. && current.ask < previous.bid then Sell
  else Hold "no cross-spread price move"

let buy_qty ~ask =
  (* # GUESS: $20 is within the user's $2-$30 order range and above Alpaca's
     $10 crypto minimum. This is an engineering demonstration, not calibrated
     size. Real fill/slippage data would calibrate it. # UNCALIBRATED GUESS *)
  let notional = 20. in
  (* # SOURCE: Alpaca crypto documentation allows up to 9 decimal places. *)
  let precision = 1_000_000_000. in
  if not (positive_finite ask) then None
  else
    let qty = floor (notional /. ask *. precision) /. precision in
    if qty *. ask >= 10. then Some qty else None
    (* # SOURCE: Alpaca crypto USD-pair minimum notional is $10. *)
