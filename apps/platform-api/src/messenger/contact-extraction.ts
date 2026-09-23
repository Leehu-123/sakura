import catalog from './address-catalog.json';
export const foldAddress = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export function extractContact(texts: string[], facebookName?: string | null) {
  const phones: string[] = [],
    addresses: string[] = [],
    names: string[] = [];
  for (const text of texts)
    for (const line of text.split(/\r?\n/)) {
      for (const match of line.matchAll(
        /(?<!\d)(?:\+84|0084|0)[ .()-]*(?:[35789](?:[ .()-]*\d){8}|2(?:[ .()-]*\d){9})(?!\d)/g,
      )) {
        const p = match[0].replace(/[ .()-]/g, '').replace(/^(\+84|0084)/, '0');
        if (/^(?:0[35789]\d{8}|02\d{9})$/.test(p)) phones.push(p);
      }
      const name = line.match(
        /^(?:tên(?: khách| người nhận)?|họ tên|người nhận|mình tên|em tên|tôi tên)\s*:?\s+([^\d,;:]{2,100})$/iu,
      )?.[1];
      if (name) names.push(name.trim());
      const explicit = line.match(
        /^(?:địa chỉ|dia chi|đc|dc|đ\/c|giao (?:đến|tới|về))\s*:?\s*(.{5,1000})$/iu,
      )?.[1];
      if (explicit) addresses.push(explicit.trim());
      else if (
        line.length >= 10 &&
        line.length <= 1000 &&
        /(?:đường|phường|huyện|thôn|xã|quận|thị trấn|tỉnh|\bp\.|\bq\.)/iu.test(line) &&
        !/[?？]/.test(line)
      )
        addresses.push(line.trim());
    }
  const unique = (s: string[]) => [...new Set(s)].slice(0, 5);
  return {
    names: unique(names.length ? names : facebookName ? [facebookName] : []),
    phones: unique(phones),
    addresses: unique(addresses),
  };
}
const normalized = catalog.map((r) => ({
  ...r,
  p: foldAddress(r.province.replace(/^(Tỉnh|Thành phố) /, '')),
  w: foldAddress(r.ward.replace(/^(Phường|Xã|Đặc khu) /, '')),
}));
export function addressCandidates(raw: string) {
  const expanded = raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\bp\.\s*/gi, 'Phường ')
    .replace(/\bq\.\s*/gi, 'Quận ')
    .replace(/\btp\.\s*/gi, 'Thành phố ');
  const f = ' ' + foldAddress(expanded) + ' ';
  const wardPart = expanded.match(/(?:phường|xã|đặc khu)\s+([^,;]+)/iu)?.[1];
  const w = wardPart ? foldAddress(wardPart).replace(/\s+(?:tinh|thanh pho)\s+.*$/, '') : '';
  if (!w)
    return {
      normalized: expanded,
      options: [],
      note: 'Chưa xác định phường/xã. Bổ sung hoặc kiểm tra với khách.',
    };
  const matches = normalized.filter((r) => r.w === w || w.startsWith(r.w + ' '));
  const provinceMatches = matches.filter((r) => f.includes(' ' + r.p + ' '));
  const choices = provinceMatches.length ? provinceMatches : matches;
  const prefix = expanded.split(/(?:phường|xã|đặc khu)\s/iu)[0].replace(/[,\s]+$/, '');
  return {
    normalized: expanded,
    options: choices
      .slice(0, 8)
      .map((r) => ({
        address: [prefix, r.ward, r.province].filter(Boolean).join(', '),
        label: r.ward + ', ' + r.province,
        code: r.code,
      })),
    note:
      choices.length === 1
        ? 'Khớp tên phường/xã trong danh mục. Kiểm tra số nhà, đường và tỉnh trước khi lưu.'
        : choices.length
          ? 'Có nhiều địa danh cùng tên. Chọn đúng tỉnh với khách; không tự đổi địa chỉ cũ sau sáp nhập.'
          : 'Chưa khớp danh mục hiện tại. Giữ địa chỉ gốc và xác nhận thêm với khách.',
  };
}
