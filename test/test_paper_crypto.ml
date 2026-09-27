open Paper_market
open Paper_crypto

(* # SOURCE: synthetic values exercise branches; they are not market data. *)

let check ok msg = if not ok then failwith msg

let quote timestamp bid ask =
  Paper_crypto.{ bid; ask; bid_size = 1.; ask_size = 1.; timestamp }

let () =
  let old = quote "2026-09-27T01:00:00Z" 100. 101. in
  let up = quote "2026-09-27T01:00:01Z" 102. 103. in
  let down = quote "2026-09-27T01:00:02Z" 98. 99. in
  check (Paper_crypto.decide ~previous:old ~current:up ~position_qty:0.
           ~has_open_order:false = Buy) "buy on crossed quote";
  check (Paper_crypto.decide ~previous:old ~current:down ~position_qty:0.01
           ~has_open_order:false = Sell) "sell on crossed quote";
  check (Paper_crypto.decide ~previous:old ~current:up ~position_qty:0.
           ~has_open_order:true = Hold "broker has an open order") "open-order guard";
  check (Paper_crypto.decide ~previous:up ~current:old ~position_qty:0.
           ~has_open_order:false = Hold "market quote has not advanced") "stale guard";
  check (Paper_crypto.buy_qty ~ask:84_000. <> None) "valid qty";
  check (Paper_crypto.buy_qty ~ask:0. = None) "invalid ask";
  let payload = Yojson.Safe.from_string
    {|{"quotes":{"BTC/USD":{"bp":100.0,"ap":101.0,"bs":1.0,"as":2.0,"t":"2026-09-27T01:00:00Z"}}}|} in
  check (Result.is_ok (Paper_crypto.parse_quote payload)) "quote parse";
  let body, code = Alpaca_http.split_status "{\"ok\":true}\n__HTTP_STATUS__:200\n" in
  check (code = 200 && body = "{\"ok\":true}") "HTTP status with trailing newline";
  print_endline "paper crypto policy checks passed"
