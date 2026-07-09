export function parseGS1(barcode: string) {
  let expiry = '';
  let batch = '';
  let gtin = '';
  
  // Strip symbology identifiers if present
  if (barcode.startsWith(']C1')) barcode = barcode.substring(3);
  if (barcode.startsWith(']d2')) barcode = barcode.substring(3);

  // Clean up explicit parentheses if they exist e.g. (01)123(17)456(10)789
  if (barcode.includes('(10)') || barcode.includes('(17)') || barcode.includes('(01)')) {
    const gtinMatch = barcode.match(/\(01\)(\d{14})/);
    if (gtinMatch) gtin = gtinMatch[1];

    const batchMatch = barcode.match(/\(10\)([A-Za-z0-9\-\_]+)/);
    if (batchMatch) batch = batchMatch[1];
    
    const expiryMatch = barcode.match(/\(17\)(\d{6})/);
    if (expiryMatch) {
      const yymmdd = expiryMatch[1];
      const year = '20' + yymmdd.substring(0, 2);
      const month = yymmdd.substring(2, 4);
      let day = yymmdd.substring(4, 6);
      if (day === '00') day = '01'; // Fallback
      expiry = `${year}-${month}-${day}`;
    }
    return { expiry, batch, gtin };
  }

  // Proper GS1 parsing for continuous strings (DataMatrix)
  // GS1 Application Identifiers:
  // 01: length 14
  // 17: length 6
  // 10: up to 20 (terminated by end of string or \x1D)
  // 21: up to 20 (terminated by end of string or \x1D)

  let remaining = barcode;
  
  while (remaining.length > 0) {
    // If there's a group separator, skip it
    if (remaining.startsWith('\x1D')) {
      remaining = remaining.substring(1);
      continue;
    }

    if (remaining.startsWith('01')) {
      if (remaining.length >= 16) {
        gtin = remaining.substring(2, 16);
        remaining = remaining.substring(16); // 2 for '01' + 14 for value
      } else {
        break;
      }
    } else if (remaining.startsWith('17')) {
      if (remaining.length >= 8) {
        const yymmdd = remaining.substring(2, 8);
        const year = '20' + yymmdd.substring(0, 2);
        const month = yymmdd.substring(2, 4);
        let day = yymmdd.substring(4, 6);
        if (day === '00') {
            const d = new Date(Number(year), Number(month), 0).getDate();
            day = d.toString().padStart(2, '0');
        }
        expiry = `${year}-${month}-${day}`;
        remaining = remaining.substring(8); // 2 for '17' + 6 for value
      } else {
        break;
      }
    } else if (remaining.startsWith('10')) {
      // variable length up to 20, or until \x1D
      let endIndex = remaining.indexOf('\x1D');
      if (endIndex === -1) endIndex = remaining.length;
      // Also, sometimes people just scan it without \x1D, so if it's the last element it takes the rest
      batch = remaining.substring(2, endIndex);
      remaining = remaining.substring(endIndex);
    } else if (remaining.startsWith('21')) {
      // Serial number, ignore for now
      let endIndex = remaining.indexOf('\x1D');
      if (endIndex === -1) endIndex = remaining.length;
      remaining = remaining.substring(endIndex);
    } else {
      // Unknown AI or corrupted barcode, let's just try to fallback search
      break;
    }
  }

  // Fallback if structured parsing failed
  if (!batch || !expiry || !gtin) {
    const cleaned = barcode.replace(/\x1D/g, '');
    if (!gtin) {
        const gtinMatch = cleaned.match(/01(\d{14})/);
        if (gtinMatch) gtin = gtinMatch[1];
    }
    if (!batch) {
        const match10 = cleaned.match(/10([A-Za-z0-9\-\_]{1,20})$/);
        if (match10) batch = match10[1];
    }
    if (!expiry) {
        const expiryMatch = cleaned.match(/(?:01\d{14})?.*?17(\d{6})/);
        if (expiryMatch) {
            const yymmdd = expiryMatch[1];
            const year = '20' + yymmdd.substring(0, 2);
            const month = yymmdd.substring(2, 4);
            let day = yymmdd.substring(4, 6);
            if (day === '00') day = '01';
            expiry = `${year}-${month}-${day}`;
        }
    }
  }

  return { expiry, batch, gtin };
}
