export interface DomainMapping {
  domain: string;
  displayName: string;
  gbp_accountId?: string;
  gbp_locationId?: string | string[];
  clarity_projectId?: string;
  /**
   * SECURITY: per-domain Clarity API tokens were removed from source — they were
   * committed to git history and must be treated as BURNED. ROTATE all of them
   * at the Microsoft Clarity dashboard.
   *
   * These literals were also vestigial: the live Clarity fetch path
   * (controllers/clarity/feature-services/service.clarity-api.ts) authenticates
   * with the single `CLARITY_API_TOKEN` env var, not this field. The field is
   * kept optional only for type compatibility; it is intentionally left unset.
   */
  clarity_apiToken?: string;
  completed?: boolean;
}

export const domainMappings: DomainMapping[] = [
  // Artful
  {
    displayName: "Artful Orthodontics", //
    domain: "artfulorthodontics.com", //  domain identifier -- will be used by front-end for filtered fetching
    gbp_accountId: "114810842911950437772", // google business profile -- constant; relates to parent info@getalloro.com account
    gbp_locationId: "10282052848626216313", // google business profile -- retrievable via its api diag routes
    clarity_projectId: "r9qqoq5h01", // microsoft clarity identifier --
    completed: true,
  },

  // Garrison
  {
    displayName: "Garrison Orthodontics",
    domain: "garrisonorthodontics.com",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "2137647135020773893",
    clarity_projectId: "r9diusipt9",
    completed: true,
  },

  // Popup Smiles
  {
    displayName: "PopUp Smiles",
    domain: "popupsmiles.com",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: [
      "109980361235418474", // Orange
      "5986586622648158122", // Newport
      "10463143860279697678", // San Juan Capistrano
      "6880513187032015995", // Onsite Dentistry
    ],
    clarity_projectId: "rn2q3umml3",
    completed: true,
  },

  // SDC
  {
    displayName: "San Diego Center for Endodontics",
    domain: "sdcendo.com",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "5912015385303248759",
    clarity_projectId: "r9dek9uzos",
    completed: true,
  },

  // Surf City
  {
    displayName: "Surf City Endodontics",
    domain: "surfcityendo.com",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "17129961858390020882",
    clarity_projectId: "r9quk55sy8",
    completed: true,
  },

  // HamiltonWise
  {
    displayName: "HamiltonWise",
    domain: "hamiltonwise.com",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "10763524725470331855",
    clarity_projectId: "r9qvm1skrr",
    completed: true,
  },

  // DEMR
  {
    displayName: "DentalEMR",
    domain: "dentalemr.com",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "9121627934732959111",
    clarity_projectId: "rbqa7tqrl5",
    completed: true,
  },

  // Caswell Orthdontics -- missing GBP
  {
    displayName: "Caswell Orthodontics",
    domain: "caswellorthodontics.com",
    gbp_accountId: "",
    gbp_locationId: "",
    clarity_projectId: "r9qtvdfcgo",
    completed: false,
  },

  // Kent Morris -- missing Clarity
  {
    displayName: "Kent Morris Orthodontics",
    domain: "kentmorrisorthodontics.com",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "18158491820874104161",
    clarity_projectId: "",
    completed: false,
  },
];
