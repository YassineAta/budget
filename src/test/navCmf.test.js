import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readFirstSheet } from '../../scripts/xlsx-lite.mjs';
import { parseListing, extractNavs } from '../../scripts/fetch-nav.mjs';
import { TUNISIAN_FUNDS } from '../utils/tunisianFunds';

const fixture = new URL('./fixtures/cmf-vl-2026-09-15.xlsx', import.meta.url);

describe('CMF NAV pipeline', () => {
  it('reads every tracked fund from the real CMF daily Excel', () => {
    const navs = extractNavs(readFirstSheet(readFileSync(fixture)));
    expect(Object.keys(navs).sort()).toEqual(TUNISIAN_FUNDS.map(f => f.slug).sort());
    expect(navs['poste-obligataire-sicav-tanit_TNILB0000044']).toBe(160.114);
    expect(navs['attijari-fcp-cea_TNILB0000035']).toBe(28.531);          // distribution fund: extra columns
    expect(navs['fcp-biat-epargne-actions_TNILB0000014']).toBe(129.164);  // accent in name
    expect(navs['fcp-prosper-plus-cea']).toBe(20.833);                    // trailing space + "+" in name
    expect(navs['btk-sicav']).toBe(139.767);
    expect(navs['tuniso-emiratie-sicav']).toBe(121.536);
  });

  it('rejects a sheet whose layout lost the "Dernière VL" column', () => {
    expect(() => extractNavs([['Dénomination', 'Gestionnaire'], [1, 'BTK SICAV', 'X', 1, 2]])).toThrow(/Dernière VL/);
  });

  it('skips implausible NAVs (shifted column guard)', () => {
    const rows = [[null, 'Dénomination', null, null, null, null, null, 'VL antérieure', 'Dernière VL'],
                  [1, 'BTK SICAV', 'BTK', 1, null, null, 100, 139.7, 36815]];
    expect(extractNavs(rows)).toEqual({});
  });

  it('pairs listing dates with unquoted, duplicated file links, newest first', () => {
    const row = (d, m, y, file) => `<div class="views-row"><h2>Valeurs liquidatives du ${d} ${m} ${y}</h2>
      <div>${d}</div><div>${m}</div><div>${y}</div>
      <a href=https://www.cmf.tn/sites/default/files/pdfs/epargne/vl/${file}><a href=https://www.cmf.tn/sites/default/files/pdfs/epargne/vl/${file}><img/></a></a></div>`;
    const html = row('28', 'Août', '2026', 'valeurs_liquidatives_260828.xlsx')
      + row('15', 'Septembre', '2026', 'vl_du_15_septembre_2026.xlsx')
      + row('02', 'Septembre', '2026', 'vl02062026.xlsx');
    expect(parseListing(html)).toEqual([
      { url: 'https://www.cmf.tn/sites/default/files/pdfs/epargne/vl/vl_du_15_septembre_2026.xlsx', navDate: '2026-09-15' },
      { url: 'https://www.cmf.tn/sites/default/files/pdfs/epargne/vl/vl02062026.xlsx', navDate: '2026-09-02' },
      { url: 'https://www.cmf.tn/sites/default/files/pdfs/epargne/vl/valeurs_liquidatives_260828.xlsx', navDate: '2026-08-28' },
    ]);
  });
});
