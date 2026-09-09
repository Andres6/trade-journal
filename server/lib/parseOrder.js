// Parses a pasted broker order line (thinkorswim / Schwab style) into
// structured fields, e.g.:
//   "SOLD -2 1/2 BACKRATIO EX 100 19 AUG 22 185/190 CALL @-.48"
//   "BOT +2 BUTTERFLY JNJ 100 21 AUG 26 270/275/287.5 CALL @.95"
//
// This mirrors what the original spreadsheet's regex formulas did, but
// runs server-side instead of relying on Google Sheets' REGEXEXTRACT.
// Net cash impact depends on both price sign and action:
//   SOLD: net follows the same sign as price (negative price = debit paid,
//         positive price = credit received)
//   BOT:  net is the opposite sign of price (negative price = credit
//         received, positive price = debit paid)
function computeNet(action, size, price) {
  return action === 'SOLD' ? 100 * size * price : -100 * size * price;
}

// Parses a pasted broker order line into structured fields. Two paste
// shapes are supported, since thinkorswim/Schwab present this differently
// depending on where you copy it from:
//   Compact:        "SOLD -2 1/2 BACKRATIO EX 100 19 AUG 22 185/190 CALL @-.48"
//   Tab-separated:  "SOLD\t2\t1/2 BACKRATIO MU 100 (Weeklys) 11 SEP 26 1200/1240 CALL @ 0.02"
// The quantity may or may not carry its own +/- sign; direction always
// comes from the action word (SOLD/BOT) instead, never from the quantity.
function parseOrderText(raw) {
  const text = String(raw || '')
    .replace(/\t+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) throw new Error('Empty order text');

  const actionMatch = text.match(/\b(SOLD|BOT)\b/i);
  if (!actionMatch) throw new Error('Could not find SOLD or BOT in order text');
  const action = actionMatch[1].toUpperCase();

  // Quantity is whatever integer (signed or not) comes right after the
  // action word — not just the first sign found anywhere in the string.
  const afterAction = text.slice(actionMatch.index + actionMatch[0].length);
  const sizeMatch = afterAction.match(/^\s*([-+]?\d+)/);
  if (!sizeMatch) throw new Error('Could not find a quantity right after SOLD/BOT in order text');
  const size = Math.abs(parseInt(sizeMatch[1], 10));

  const afterSize = afterAction.slice(sizeMatch[0].length);

  // Price after the "@" sign, e.g. "@-.48", "@ 0.02", "@1.50", "@-1.45"
  const priceMatch = afterSize.match(/@\s*(-?\.?\d+\.?\d*)/);
  if (!priceMatch) throw new Error('Could not find a price (look for "@" in the order text)');
  const price = parseFloat(priceMatch[1]);
  if (Number.isNaN(price)) throw new Error('Could not find a price (look for "@" in the order text)');

  // Structure: everything between the quantity and the "@price".
  let structure = afterSize.slice(0, priceMatch.index).trim();
  if (!structure) structure = text;

  // Net cash impact depends on both price sign and action:
  //   SOLD: net follows the same sign as price (negative price = debit paid,
  //         positive price = credit received)
  //   BOT:  net is the opposite sign of price (negative price = credit
  //         received, positive price = debit paid)
  const net = computeNet(action, size, price);

  return { action, size, structure, price, net, raw_text: text };
}

module.exports = { parseOrderText, computeNet };
