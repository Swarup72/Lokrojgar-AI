/**
 * The LokRozgar skill catalog: trades and their sub-skills.
 *
 * Shape and naming follow what the application already uses - a trilingual
 * {mr, hi, en} name, grouped under the four existing JobCategory documents.
 * Every one of the 13 original skills is preserved EXACTLY as spelled in
 * seeds/seed.js, because the seeder matches on `name.en` and existing Skill
 * _ids (referenced by Job.skillIds and WorkerSkill.skillId) must not change.
 * The additions sit alongside them.
 *
 * Structure:
 *   "Trade name": { category, mr, hi, subSkills: [ {mr,hi,en}, ... ] }
 *
 * A trade is a Skill with parentSkillId === null; each sub-skill is a Skill
 * whose parentSkillId points at its trade and which inherits its category.
 *
 * Sub-skills are deliberately the concrete jobs an employer actually asks for
 * and a worker would recognise - not a taxonomy for its own sake. Trades that
 * are already a single specific task (Crop Harvesting, Loading & Unloading)
 * have no sub-skills rather than invented ones.
 */

export const CATEGORY_CONSTRUCTION = "Construction Work";
export const CATEGORY_AGRICULTURE = "Agriculture & Gardening";
export const CATEGORY_LOGISTICS = "Logistics & Transport";
export const CATEGORY_DOMESTIC = "Domestic & Hospitality";
export const CATEGORY_REPAIR = "Repair & Technical";
export const CATEGORY_PERSONAL = "Personal Care & Services";

/** Categories added by this catalog, beyond the four the original seed created. */
export const ADDITIONAL_CATEGORIES = [
  {
    name: { mr: "दुरुस्ती आणि तांत्रिक काम", hi: "मरम्मत और तकनीकी कार्य", en: CATEGORY_REPAIR },
    description: "Electrical, appliance, vehicle and machine repair work",
  },
  {
    name: { mr: "वैयक्तिक सेवा", hi: "व्यक्तिगत सेवाएं", en: CATEGORY_PERSONAL },
    description: "Tailoring, grooming, beauty and security services",
  },
];

export const SKILL_CATALOG = {
  // ---- Construction Work (4 original trades, sub-skills added) -------------
  Masonry: {
    category: CATEGORY_CONSTRUCTION,
    mr: "गवंडीकाम",
    hi: "राजमिस्त्री",
    subSkills: [
      { mr: "विटकाम", hi: "ईंट का काम", en: "Brick Laying" },
      { mr: "काँक्रीट काम", hi: "कंक्रीट कार्य", en: "Concrete Work" },
      { mr: "फरशी बसवणे", hi: "टाइल लगाना", en: "Tile Work" },
      { mr: "प्लास्टर काम", hi: "प्लास्टर कार्य", en: "Plastering" },
    ],
  },
  Plumbing: {
    category: CATEGORY_CONSTRUCTION,
    mr: "प्लंबिंग",
    hi: "प्लंबिंग",
    subSkills: [
      { mr: "पाईप फिटिंग", hi: "पाइप फिटिंग", en: "Pipe Fitting" },
      { mr: "गळती दुरुस्ती", hi: "रिसाव मरम्मत", en: "Leak Repair" },
      { mr: "नळ बसवणे", hi: "नल लगाना", en: "Tap Installation" },
      { mr: "बाथरूम प्लंबिंग", hi: "बाथरूम प्लंबिंग", en: "Bathroom Plumbing" },
    ],
  },
  Carpentry: {
    category: CATEGORY_CONSTRUCTION,
    mr: "सुतारकाम",
    hi: "बढ़ईगीरी",
    subSkills: [
      { mr: "फर्निचर दुरुस्ती", hi: "फर्नीचर मरम्मत", en: "Furniture Repair" },
      { mr: "दरवाजा बसवणे", hi: "दरवाज़ा लगाना", en: "Door Installation" },
      { mr: "लाकूड कापणी", hi: "लकड़ी काटना", en: "Wood Cutting" },
      { mr: "मॉड्युलर फर्निचर", hi: "मॉड्यूलर फर्नीचर", en: "Modular Furniture" },
    ],
  },
  Painting: {
    category: CATEGORY_CONSTRUCTION,
    mr: "रंगकाम",
    hi: "पेंटिंग",
    subSkills: [
      { mr: "अंतर्गत रंगकाम", hi: "आंतरिक पेंटिंग", en: "Interior Painting" },
      { mr: "बाह्य रंगकाम", hi: "बाहरी पेंटिंग", en: "Exterior Painting" },
      { mr: "भिंत तयारी", hi: "दीवार की तैयारी", en: "Wall Preparation" },
      { mr: "पुट्टी काम", hi: "पुट्टी कार्य", en: "Putty Work" },
    ],
  },
  // new construction trades
  Welding: {
    category: CATEGORY_CONSTRUCTION,
    mr: "वेल्डिंग",
    hi: "वेल्डिंग",
    subSkills: [
      { mr: "ग्रिल बनवणे", hi: "ग्रिल बनाना", en: "Grill Fabrication" },
      { mr: "गेट वेल्डिंग", hi: "गेट वेल्डिंग", en: "Gate Welding" },
      { mr: "लोखंडी सळई बांधणी", hi: "सरिया बांधना", en: "Steel Bar Binding" },
    ],
  },
  Roofing: {
    category: CATEGORY_CONSTRUCTION,
    mr: "छत बांधणी",
    hi: "छत का काम",
    subSkills: [
      { mr: "पत्रा बसवणे", hi: "शीट लगाना", en: "Sheet Roofing" },
      { mr: "छत गळती दुरुस्ती", hi: "छत रिसाव मरम्मत", en: "Roof Leak Repair" },
    ],
  },
  "Construction Helper": {
    category: CATEGORY_CONSTRUCTION,
    mr: "बांधकाम मदतनीस",
    hi: "निर्माण सहायक",
    subSkills: [],
  },

  // ---- Repair & Technical (new category - Electrician lives here) ----------
  Electrician: {
    category: CATEGORY_REPAIR,
    mr: "इलेक्ट्रिशियन",
    hi: "इलेक्ट्रिशियन",
    subSkills: [
      { mr: "वायर जोडणी", hi: "वायर कनेक्शन", en: "Wire Connection" },
      { mr: "स्विच बसवणे", hi: "स्विच इंस्टॉलेशन", en: "Switch Installation" },
      { mr: "फॅन बसवणे", hi: "फैन इंस्टॉलेशन", en: "Fan Installation" },
      { mr: "मोटर दुरुस्ती", hi: "मोटर मरम्मत", en: "Motor Repair" },
      { mr: "विद्युत देखभाल", hi: "विद्युत रखरखाव", en: "Electrical Maintenance" },
    ],
  },
  "AC Repair": {
    category: CATEGORY_REPAIR,
    mr: "एसी दुरुस्ती",
    hi: "एसी मरम्मत",
    subSkills: [
      { mr: "एसी बसवणे", hi: "एसी इंस्टॉलेशन", en: "AC Installation" },
      { mr: "गॅस भरणे", hi: "गैस चार्जिंग", en: "Gas Refilling" },
      { mr: "एसी सर्व्हिसिंग", hi: "एसी सर्विसिंग", en: "AC Servicing" },
    ],
  },
  "Refrigerator Repair": {
    category: CATEGORY_REPAIR,
    mr: "फ्रीज दुरुस्ती",
    hi: "फ्रिज मरम्मत",
    subSkills: [
      { mr: "कॉम्प्रेसर दुरुस्ती", hi: "कंप्रेसर मरम्मत", en: "Compressor Repair" },
      { mr: "कूलिंग दुरुस्ती", hi: "कूलिंग मरम्मत", en: "Cooling Repair" },
    ],
  },
  "Vehicle Repair": {
    category: CATEGORY_REPAIR,
    mr: "वाहन दुरुस्ती",
    hi: "वाहन मरम्मत",
    subSkills: [
      { mr: "दुचाकी दुरुस्ती", hi: "दोपहिया मरम्मत", en: "Two-Wheeler Repair" },
      { mr: "पंक्चर काढणे", hi: "पंचर ठीक करना", en: "Puncture Repair" },
      { mr: "इंजिन दुरुस्ती", hi: "इंजन मरम्मत", en: "Engine Repair" },
    ],
  },
  "Machine Operator": {
    category: CATEGORY_REPAIR,
    mr: "मशीन चालक",
    hi: "मशीन ऑपरेटर",
    subSkills: [
      { mr: "मिक्सर चालवणे", hi: "मिक्सर चलाना", en: "Mixer Operation" },
      { mr: "कटिंग मशीन", hi: "कटिंग मशीन", en: "Cutting Machine Operation" },
    ],
  },

  // ---- Agriculture & Gardening (3 original + additions) -------------------
  "Crop Harvesting": { category: CATEGORY_AGRICULTURE, mr: "पीक कापणी", hi: "फसल कटाई", subSkills: [] },
  "Pesticide Spraying": { category: CATEGORY_AGRICULTURE, mr: "फवारणी", hi: "कीटनाशक छिड़काव", subSkills: [] },
  "Tractor Driving": {
    category: CATEGORY_AGRICULTURE,
    mr: "ट्रॅक्टर चालवणे",
    hi: "ट्रैक्टर चलाना",
    subSkills: [
      { mr: "नांगरणी", hi: "जुताई", en: "Ploughing" },
      { mr: "ट्रेलर वाहतूक", hi: "ट्रेलर परिवहन", en: "Trailer Transport" },
    ],
  },
  "Farm Labour": {
    category: CATEGORY_AGRICULTURE,
    mr: "शेतमजुरी",
    hi: "खेत मजदूरी",
    subSkills: [
      { mr: "पेरणी", hi: "बुवाई", en: "Sowing" },
      { mr: "खुरपणी", hi: "निराई", en: "Weeding" },
      { mr: "पाणी देणे", hi: "सिंचाई", en: "Irrigation" },
    ],
  },
  Gardening: {
    category: CATEGORY_AGRICULTURE,
    mr: "बागकाम",
    hi: "बागवानी",
    subSkills: [
      { mr: "झाडांची छाटणी", hi: "पौधों की कटाई", en: "Plant Trimming" },
      { mr: "लॉन देखभाल", hi: "लॉन रखरखाव", en: "Lawn Maintenance" },
    ],
  },

  // ---- Logistics & Transport (3 original + additions) ---------------------
  "Loading & Unloading": {
    category: CATEGORY_LOGISTICS,
    mr: "माल चढवणे व उतरवणे",
    hi: "लोडिंग और अनलोडिंग",
    subSkills: [],
  },
  "Tempo Driver": {
    category: CATEGORY_LOGISTICS,
    mr: "टेंपो चालक",
    hi: "टैम्पो चालक",
    subSkills: [],
  },
  "Delivery Agent": {
    category: CATEGORY_LOGISTICS,
    mr: "डिलिव्हरी बॉय",
    hi: "डिलीवरी बॉय",
    subSkills: [
      { mr: "अन्न वितरण", hi: "फूड डिलीवरी", en: "Food Delivery" },
      { mr: "पार्सल वितरण", hi: "पार्सल डिलीवरी", en: "Parcel Delivery" },
    ],
  },
  Driver: {
    category: CATEGORY_LOGISTICS,
    mr: "चालक",
    hi: "ड्राइवर",
    subSkills: [
      { mr: "कार चालक", hi: "कार ड्राइवर", en: "Car Driving" },
      { mr: "ऑटो रिक्षा", hi: "ऑटो रिक्शा", en: "Auto Rickshaw Driving" },
      { mr: "ट्रक चालक", hi: "ट्रक ड्राइवर", en: "Truck Driving" },
    ],
  },
  "Warehouse Worker": {
    category: CATEGORY_LOGISTICS,
    mr: "गोदाम कामगार",
    hi: "गोदाम कर्मचारी",
    subSkills: [
      { mr: "माल वर्गीकरण", hi: "सामान छंटाई", en: "Goods Sorting" },
      { mr: "साठा नोंद", hi: "स्टॉक रिकॉर्ड", en: "Stock Keeping" },
    ],
  },

  // ---- Domestic & Hospitality (3 original + additions) --------------------
  Cooking: {
    category: CATEGORY_DOMESTIC,
    mr: "स्वयंपाक",
    hi: "खाना बनाना",
    subSkills: [
      { mr: "घरगुती स्वयंपाक", hi: "घरेलू खाना", en: "Home Cooking" },
      { mr: "हॉटेल स्वयंपाक", hi: "होटल रसोई", en: "Commercial Kitchen" },
      { mr: "पोळी भाजी", hi: "रोटी सब्ज़ी", en: "Roti & Sabzi Making" },
    ],
  },
  Cleaning: {
    category: CATEGORY_DOMESTIC,
    mr: "सफाई काम",
    hi: "सफाई कार्य",
    subSkills: [
      { mr: "घर सफाई", hi: "घर की सफाई", en: "House Cleaning" },
      { mr: "कार्यालय सफाई", hi: "कार्यालय सफाई", en: "Office Cleaning" },
      { mr: "भांडी घासणे", hi: "बर्तन धोना", en: "Dishwashing" },
    ],
  },
  "Waiter Service": {
    category: CATEGORY_DOMESTIC,
    mr: "वेटर्स",
    hi: "वेटर",
    subSkills: [
      { mr: "टेबल सेवा", hi: "टेबल सर्विस", en: "Table Service" },
      { mr: "समारंभ सेवा", hi: "कार्यक्रम सेवा", en: "Event Service" },
    ],
  },
  Housekeeping: {
    category: CATEGORY_DOMESTIC,
    mr: "घरकाम",
    hi: "हाउसकीपिंग",
    subSkills: [
      { mr: "कपडे धुणे", hi: "कपड़े धोना", en: "Laundry" },
      { mr: "मुलांची देखभाल", hi: "बच्चों की देखभाल", en: "Child Care" },
      { mr: "वृद्ध देखभाल", hi: "बुज़ुर्गों की देखभाल", en: "Elder Care" },
    ],
  },

  // ---- Personal Care & Services (new category) ----------------------------
  "Security Guard": {
    category: CATEGORY_PERSONAL,
    mr: "सुरक्षा रक्षक",
    hi: "सुरक्षा गार्ड",
    subSkills: [
      { mr: "रात्र पाळी सुरक्षा", hi: "रात्रि ड्यूटी", en: "Night Duty" },
      { mr: "सोसायटी सुरक्षा", hi: "सोसायटी गार्ड", en: "Society Security" },
    ],
  },
  Tailor: {
    category: CATEGORY_PERSONAL,
    mr: "शिंपी",
    hi: "दर्जी",
    subSkills: [
      { mr: "ब्लाउज शिवणे", hi: "ब्लाउज़ सिलाई", en: "Blouse Stitching" },
      { mr: "अल्टरेशन", hi: "अल्टरेशन", en: "Alteration" },
    ],
  },
  Barber: {
    category: CATEGORY_PERSONAL,
    mr: "न्हावी",
    hi: "नाई",
    subSkills: [
      { mr: "केस कापणी", hi: "बाल कटाई", en: "Hair Cutting" },
      { mr: "दाढी करणे", hi: "शेविंग", en: "Shaving" },
    ],
  },
  Beautician: {
    category: CATEGORY_PERSONAL,
    mr: "ब्युटीशियन",
    hi: "ब्यूटीशियन",
    subSkills: [
      { mr: "मेहंदी", hi: "मेहंदी", en: "Mehendi" },
      { mr: "मेकअप", hi: "मेकअप", en: "Makeup" },
      { mr: "थ्रेडिंग", hi: "थ्रेडिंग", en: "Threading" },
    ],
  },
};

/** The four categories the original seed created, by `name.en`. */
export const ORIGINAL_CATEGORIES = [
  CATEGORY_CONSTRUCTION,
  CATEGORY_AGRICULTURE,
  CATEGORY_LOGISTICS,
  CATEGORY_DOMESTIC,
];

/**
 * The 13 skills the original seed created. Their _ids are referenced by
 * existing Job.skillIds / WorkerSkill.skillId documents and must never be
 * recreated under a different id - the seeder matches them by `name.en`.
 */
export const ORIGINAL_SKILL_NAMES = [
  "Masonry",
  "Plumbing",
  "Carpentry",
  "Painting",
  "Crop Harvesting",
  "Pesticide Spraying",
  "Tractor Driving",
  "Loading & Unloading",
  "Tempo Driver",
  "Delivery Agent",
  "Cooking",
  "Cleaning",
  "Waiter Service",
];
