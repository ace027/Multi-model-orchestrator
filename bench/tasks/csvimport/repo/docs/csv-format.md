# CSV statement format

Banks export statements as CSV in several variants. `import_csv(store, account, text)` accepts all of the ones below. `text` is the file's content as read (it may still start with a byte-order mark).

## File

- Lines end with `\n` or `\r\n`. The text may begin with a UTF-8 byte-order mark (`﻿`), which is not part of the first field.
- The first non-blank line is the header. The delimiter is `;` if the header line contains a `;`, otherwise `,`. The whole file uses that delimiter.
- A field may be quoted with `"`. A quoted field may contain the delimiter; `""` inside it is a literal quote. Fields never contain line breaks.
- Blank lines (empty or only whitespace) are skipped anywhere.
- A line whose first field, trimmed, starts with `total` (any case) ends the data: it and every line after it are ignored.

## Columns

Header names are matched case-insensitively after trimming spaces. Columns may come in any order; unknown columns are ignored.

| Meaning | Header names | |
|---|---|---|
| date | `Date`, `Posted`, `Transaction Date` | required |
| description | `Description`, `Payee`, `Memo` | required; if several are present, `Description` wins over `Payee`, and `Payee` over `Memo` |
| amount | `Amount`, or both `Debit` and `Credit` | required |
| currency | `Currency` | optional |

A header without a date, description or amount column is a file error: nothing is imported, and `errors` holds one `RowError` for the header's line.

Descriptions are trimmed and runs of whitespace collapsed to one space (`normalize_description`).

## Dates

- `YYYY-MM-DD` is accepted in every file.
- Slash dates depend on the delimiter: `DD/MM/YYYY` in semicolon files, `MM/DD/YYYY` in comma files.
- Any other form, or a date that does not exist (`2026-02-30`, `13/01/2026` in a comma file), is a row error.

## Amounts

Amounts become integer cents exactly. Do not go through floating point: `0.29` must be 29 cents.

- Comma files use `.` as the decimal separator and `,` to group thousands (`"1,234.56"`, quoted because it holds the delimiter). Semicolon files use `,` as the decimal separator and `.` to group thousands (`1.234,56`).
- One currency symbol (`$`, `€` or `£`) may come directly before the digits and is ignored.
- A negative amount is written with a leading `-`, a trailing `-` (`12.00-`), or in parentheses (`(12.00)`).
- An amount may have zero, one or two decimal places (`12`, `12.5`, `12.50`). More is a row error.
- With `Debit` and `Credit` columns, exactly one of the two is filled in each row. A debit of `12.00` is an amount of -1200 cents, a credit of `12.00` is +1200. Both filled or both empty is a row error. Debit and credit values are unsigned; a sign or parentheses there is a row error.

## Currency

An empty or missing currency means the account's currency. A row in any other currency is a row error.

## Errors

A row error does not stop the import. The row is left out and recorded as `RowError(line, message)`, where `line` is the row's 1-based line number in the text, counting the header and blank lines. The message says what was wrong.

## Duplicates

Statements overlap, so importing must not create duplicates. Two transactions are the same when their date, amount and (normalised) description are equal. A statement can hold identical transactions legitimately (two coffees on one day), so duplicates are matched by count: if the file holds n identical transactions and the account already holds k of them, the importer adds max(0, n - k) and counts the rest in `ImportResult.duplicates`.

## Result

New transactions are added to the store in file order and listed in `ImportResult.added` in the same order.
