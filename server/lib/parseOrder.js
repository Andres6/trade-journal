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

function parseOrderText(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Empty order text');

  const actionMatch = text.match(/\b(SOLD|BOT)\b/i);
  const action = actionMatch ? actionMatch[1].toUpperCase() : null;
  if (!action) throw new Error('Could not find SOLD or BOT in order text');

  // First signed integer after the action keyword, e.g. "-2" or "+2"
  const sizeMatch = text.match(/[-+]\s?(\d+)/);
  const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null;
  if (!size) throw new Error('Could not find a quantity in order text');

  // Price after the "@" sign, e.g. "@-.48", "@.95", "@1.50", "@-1.45"
  const priceMatch = text.match(/@\s*(-?\.?\d+\.?\d*)/);
  const price = priceMatch ? parseFloat(priceMatch[1]) : null;
  if (price === null || Number.isNaN(price)) {
    throw new Error('Could not find a price (look for "@" in the order text)');
  }

  // Structure: strip the leading "SOLD -2 " / "BOT +2 " prefix and the
  // trailing "@price" suffix, leaving the human-readable trade description.
  let structure = text
    .replace(/^.*?(SOLD|BOT)\s*[-+]?\s*\d+\s*/i, '')
    .replace(/\s*@\s*-?\.?\d+\.?\d*.*$/, '')
    .trim();
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
