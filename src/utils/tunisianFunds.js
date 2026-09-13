// Curated list of Tunisian SICAV/FCP funds.
// slug: ilboursa.com URL identifier
// millimSlug: millim.tn URL identifier (primary NAV source — no proxy blocks)
export const TUNISIAN_FUNDS = [
  { label: 'ATTIJARI FCP CEA',                    slug: 'attijari-fcp-cea_TNILB0000035',                    millimSlug: 'attijari-gestion-attijari-fcp-cea' },
  { label: 'ATTIJARI FCP DYNAMIQUE',              slug: 'attijari-fcp-dynamique_TNILB0000033',              millimSlug: 'attijari-gestion-attijari-fcp-dynamique' },
  { label: 'ATTIJARI OBLIGATAIRE SICAV',          slug: 'attijari-obligataire-sicav_TNILB0000034',          millimSlug: 'attijari-gestion-attijari-obligataire-sicav' },
  { label: 'FCP AMEN CEA',                        slug: 'fcp-amen-cea_TNILB0000120',                        millimSlug: null },
  { label: 'FCP BH CEA',                          slug: 'fcp-bh-cea_TNILB0000045',                          millimSlug: 'bh-invest-fcp-bh-cea' },
  { label: 'FCP BIAT ÉPARGNE ACTIONS',            slug: 'fcp-biat-epargne-actions_TNILB0000014',            millimSlug: null },
  { label: 'FCP BIAT-CEA PNT TUNISAIR',           slug: 'fcp-biat-cea-pnt-tunisair_TNILB0000013',           millimSlug: null },
  { label: 'FCP BNA CEA',                         slug: 'fcp-bna-cea_TNILB0000126',                         millimSlug: null },
  { label: 'FCP CEA MAXULA',                      slug: 'fcp-cea-maxula_TNILB0000038',                      millimSlug: 'maxula-bourse-fcp-cea-maxula' },
  { label: 'FCP DELTA EPARGNE ACTIONS',           slug: 'fcp-delta-epargne-actions_TNILB0000059',           millimSlug: 'stb-finance-fcp-delta-epargne-actions' },
  { label: 'FCP ILBOURSA CEA',                    slug: 'fcp-ilboursa-cea_TNILB0000099',                    millimSlug: 'mac-sa-fcp-ilboursa-cea' },
  { label: 'FCP INNOVATION',                      slug: 'fcp-innovation_TNILB0000060',                      millimSlug: null },
  { label: 'FCP IRADETT CEA',                     slug: 'fcp-iradett-cea_TNILB0000026',                     millimSlug: null },
  { label: 'FCP MAGHREBIA SELECT ACTIONS',        slug: 'fcp-maghrebia-select-actions_TNILB0000081',        millimSlug: null },
  { label: 'FCP PERSONNEL UIB EPARGNE ACTIONS',   slug: 'fcp-personnel-uib-epargne-actions_TNILB0000021',   millimSlug: null },
  { label: 'FCP VALEURS CEA',                     slug: 'fcp-valeurs-cea_TNILB0000004',                     millimSlug: 'tunisie-valeurs-asset-management-fcp-valeurs-cea' },
  { label: 'MAC CROISSANCE FCP',                  slug: 'mac-croissance-fcp_TNILB0000020',                  millimSlug: 'mac-sa-mac-croissance-fcp' },
  { label: 'MAC EPARGNE ACTIONS FCP',             slug: 'mac-epargne-actions-fcp_TNILB0000017',             millimSlug: null },
  { label: 'MCP CEA FUND',                        slug: 'mcp-cea-fund_TNILB0000077',                        millimSlug: 'mena-capital-partners-mcp-cea-fund' },
  { label: 'POSTE OBLIGATAIRE SICAV TANIT',       slug: 'poste-obligataire-sicav-tanit_TNILB0000044',       millimSlug: 'bh-invest-poste-obligataire-sicav-tanit' },
  { label: 'UBCI - FCP CEA',                      slug: 'ubci--fcp-cea_TNILB0000072',                       millimSlug: null },
].sort((a, b) => a.label.localeCompare(b.label));
