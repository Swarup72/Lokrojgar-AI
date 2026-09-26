import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model.js";
import JobCategory from "../models/jobCategory.model.js";
import Skill from "../models/skill.model.js";

dotenv.config();

const SEED_CATEGORIES = [
  {
    name: {
      mr: "बांधकाम कार्य",
      hi: "निर्माण कार्य",
      en: "Construction Work",
    },
    description: "General construction, masonry, plastering, and site work",
  },
  {
    name: {
      mr: "शेती आणि बागायत",
      hi: "कृषि एवं बागवानी",
      en: "Agriculture & Gardening",
    },
    description: "Farming, crop harvesting, gardening, and soil preparation",
  },
  {
    name: {
      mr: "लॉजिस्टिक आणि वाहतूक",
      hi: "लॉजिस्टिक और परिवहन",
      en: "Logistics & Transport",
    },
    description: "Loading, unloading, driving, and delivery services",
  },
  {
    name: {
      mr: "घरगुती आणि हॉटेल सेवा",
      hi: "घरेलू और होटल सेवाएं",
      en: "Domestic & Hospitality",
    },
    description: "Cooking, cleaning, housekeeping, and waiter staff",
  },
];

const SEED_SKILLS_MAPPING = {
  "Construction Work": [
    { mr: "गवंडीकाम", hi: "राजमिस्त्री", en: "Masonry" },
    { mr: "प्लंबिंग", hi: "प्लंबिंग", en: "Plumbing" },
    { mr: "सुतारकाम", hi: "बढ़ईगीरी", en: "Carpentry" },
    { mr: "रंगकाम", hi: "पेंटिंग", en: "Painting" },
  ],
  "Agriculture & Gardening": [
    { mr: "पीक कापणी", hi: "फसल कटाई", en: "Crop Harvesting" },
    { mr: "फवारणी", hi: "कीटनाशक छिड़काव", en: "Pesticide Spraying" },
    { mr: "ट्रॅक्टर चालवणे", hi: "ट्रैक्टर चलाना", en: "Tractor Driving" },
  ],
  "Logistics & Transport": [
    { mr: "माल चढवणे व उतरवणे", hi: "लोडिंग और अनलोडिंग", en: "Loading & Unloading" },
    { mr: "टेंपो चालक", hi: "टैम्पो चालक", en: "Tempo Driver" },
    { mr: "डिलिव्हरी बॉय", hi: "डिलीवरी बॉय", en: "Delivery Agent" },
  ],
  "Domestic & Hospitality": [
    { mr: "स्वयंपाक", hi: "खाना बनाना", en: "Cooking" },
    { mr: "सफाई काम", hi: "सफाई कार्य", en: "Cleaning" },
    { mr: "वेटर्स", hi: "वेटर", en: "Waiter Service" },
  ],
};

const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lokrozgar";
    console.log("Connecting to MongoDB for seeding...");
    await mongoose.connect(mongoUri);

    console.log("Seeding First Admin User...");
    const adminPhone = "+919999999999";
    const existingAdmin = await User.findOne({ phone: adminPhone });
    if (!existingAdmin) {
      await User.create({
        phone: adminPhone,
        passwordHash: "Admin@12345",
        roles: ["admin"],
        preferredLanguage: "mr",
        isVerified: true,
        phoneVerifiedAt: new Date(),
      });
      console.log("Admin User Created: +919999999999 / Admin@12345");
    } else {
      console.log("Admin User already exists.");
    }

    console.log("Seeding Job Categories and Skills in Marathi, Hindi, and English...");
    for (const catData of SEED_CATEGORIES) {
      let category = await JobCategory.findOne({ "name.en": catData.name.en });
      if (!category) {
        category = await JobCategory.create(catData);
        console.log(`Created Category: ${catData.name.en}`);
      }

      const skillsList = SEED_SKILLS_MAPPING[catData.name.en] || [];
      for (const skillNameObj of skillsList) {
        const existingSkill = await Skill.findOne({
          categoryId: category._id,
          "name.en": skillNameObj.en,
        });

        if (!existingSkill) {
          await Skill.create({
            categoryId: category._id,
            name: skillNameObj,
          });
          console.log(`  -> Created Skill: ${skillNameObj.en}`);
        }
      }
    }

    console.log("Seeding Completed Successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding Failed:", error);
    process.exit(1);
  }
};

seedDatabase();
