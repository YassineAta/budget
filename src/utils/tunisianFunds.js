// Curated list of Tunisian SICAV/FCP funds with their ilboursa.com slugs.
// Slug format: {fund-name}_{TNILB-ISIN} — used to build the ilboursa fund page URL.
// To add a fund: find its page on ilboursa.com/opcvm and copy the slug from the URL.
export const TUNISIAN_FUNDS = [
  { label: 'ATTIJARI FCP CEA',                    slug: 'attijari-fcp-cea_TNILB0000035' },
  { label: 'ATTIJARI FCP DYNAMIQUE',              slug: 'attijari-fcp-dynamique_TNILB0000033' },
  { label: 'ATTIJARI OBLIGATAIRE SICAV',          slug: 'attijari-obligataire-sicav_TNILB0000034' },
  { label: 'FCP AMEN CEA',                        slug: 'fcp-amen-cea_TNILB0000120' },
  { label: 'FCP BH CEA',                          slug: 'fcp-bh-cea_TNILB0000045' },
  { label: 'FCP BIAT ÉPARGNE ACTIONS',            slug: 'fcp-biat-epargne-actions_TNILB0000014' },
  { label: 'FCP BIAT-CEA PNT TUNISAIR',           slug: 'fcp-biat-cea-pnt-tunisair_TNILB0000013' },
  { label: 'FCP BNA CEA',                         slug: 'fcp-bna-cea_TNILB0000126' },
  { label: 'FCP CEA MAXULA',                      slug: 'fcp-cea-maxula_TNILB0000038' },
  { label: 'FCP DELTA EPARGNE ACTIONS',           slug: 'fcp-delta-epargne-actions_TNILB0000059' },
  { label: 'FCP ILBOURSA CEA',                    slug: 'fcp-ilboursa-cea_TNILB0000099' },
  { label: 'FCP INNOVATION',                      slug: 'fcp-innovation_TNILB0000060' },
  { label: 'FCP IRADETT CEA',                     slug: 'fcp-iradett-cea_TNILB0000026' },
  { label: 'FCP MAGHREBIA SELECT ACTIONS',        slug: 'fcp-maghrebia-select-actions_TNILB0000081' },
  { label: 'FCP PERSONNEL UIB EPARGNE ACTIONS',   slug: 'fcp-personnel-uib-epargne-actions_TNILB0000021' },
  { label: 'FCP VALEURS CEA',                     slug: 'fcp-valeurs-cea_TNILB0000004' },
  { label: 'MAC CROISSANCE FCP',                  slug: 'mac-croissance-fcp_TNILB0000020' },
  { label: 'MAC EPARGNE ACTIONS FCP',             slug: 'mac-epargne-actions-fcp_TNILB0000017' },
  { label: 'MCP CEA FUND',                        slug: 'mcp-cea-fund_TNILB0000077' },
  { label: 'POSTE OBLIGATAIRE SICAV TANIT',       slug: 'poste-obligataire-sicav-tanit_TNILB0000044' },
  { label: 'UBCI - FCP CEA',                      slug: 'ubci--fcp-cea_TNILB0000072' },
].sort((a, b) => a.label.localeCompare(b.label));
