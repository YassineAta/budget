// Tracked Tunisian OPCVM funds.
// slug: stable ID stored in goal placements (ilboursa-style where one existed — don't change, saved data references it)
// cmfName: fund name as written in the CMF daily NAV Excel ("Dénomination" column) — matched accent/space-insensitively
export const TUNISIAN_FUNDS = [
  { label: 'ATTIJARI FCP CEA',               slug: 'attijari-fcp-cea_TNILB0000035',              cmfName: 'ATTIJARI FCP CEA' },
  { label: 'BTK SICAV',                      slug: 'btk-sicav',                                  cmfName: 'BTK SICAV' },
  { label: 'FCP BIAT ÉPARGNE ACTIONS',       slug: 'fcp-biat-epargne-actions_TNILB0000014',      cmfName: 'FCP BIAT ÉPARGNE ACTIONS' },
  { label: 'FCP PROSPER + CEA',              slug: 'fcp-prosper-plus-cea',                       cmfName: 'FCP PROSPER + CEA' },
  { label: 'POSTE OBLIGATAIRE SICAV TANIT',  slug: 'poste-obligataire-sicav-tanit_TNILB0000044', cmfName: 'POSTE OBLIGATAIRE SICAV TANIT' },
  { label: 'TUNISO-EMIRATIE SICAV',          slug: 'tuniso-emiratie-sicav',                      cmfName: 'TUNISO-EMIRATIE SICAV' },
];

// Canonical form for matching CMF names: no accents, uppercase, single spaces.
export const normalizeFundName = (s) => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();
