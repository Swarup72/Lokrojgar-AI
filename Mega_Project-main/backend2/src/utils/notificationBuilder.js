/**
 * Trilingual Notification Builder Helper.
 * Generates notification title and body in all 3 supported languages (mr, hi, en).
 */

const NOTIFICATION_TEMPLATES = {
  JOB_ALERT: (data = {}) => ({
    title: {
      mr: `नवीन काम उपलब्ध: ${data.jobTitle || "नोकरी"}`,
      hi: `नया काम उपलब्ध: ${data.jobTitle || "नौकरी"}`,
      en: `New Job Available: ${data.jobTitle || "Job"}`,
    },
    body: {
      mr: `तुमच्या भागात ₹${data.payAmount || 0} प्रति ${data.payType || "दिवस"} ची नोकरी उपलब्ध आहे.`,
      hi: `आपके क्षेत्र में ₹${data.payAmount || 0} प्रति ${data.payType || "दिन"} की नौकरी उपलब्ध है।`,
      en: `A job paying ₹${data.payAmount || 0} per ${data.payType || "day"} is available near you.`,
    },
  }),

  APPLICATION_ACCEPTED: (data = {}) => ({
    title: {
      mr: "अर्ज स्वीकारला गेला!",
      hi: "आवेदन स्वीकृत हो गया!",
      en: "Application Accepted!",
    },
    body: {
      mr: `तुमचा "${data.jobTitle || "नोकरी"}" साठीचा अर्ज स्वीकारण्यात आला आहे.`,
      hi: `आपका "${data.jobTitle || "नौकरी"}" के लिए आवेदन स्वीकार कर लिया गया है।`,
      en: `Your application for "${data.jobTitle || "Job"}" has been accepted.`,
    },
  }),

  APPLICATION_REJECTED: (data = {}) => ({
    title: {
      mr: "अर्ज अद्यतन",
      hi: "आवेदन अद्यतन",
      en: "Application Update",
    },
    body: {
      mr: `"${data.jobTitle || "नोकरी"}" साठीचा अर्ज निवडला गेला नाही.`,
      hi: `"${data.jobTitle || "नौकरी"}" के लिए आपका आवेदन चुना नहीं गया।`,
      en: `Your application for "${data.jobTitle || "Job"}" was not selected.`,
    },
  }),

  PAYMENT_RECEIVED: (data = {}) => ({
    title: {
      mr: "रक्कम जमा झाली!",
      hi: "भुगतान प्राप्त हुआ!",
      en: "Payment Received!",
    },
    body: {
      mr: `तुम्हाला ₹${data.amount || 0} ची रक्कम प्राप्त झाली आहे.`,
      hi: `आपको ₹${data.amount || 0} का भुगतान प्राप्त हुआ है।`,
      en: `You have received a payment of ₹${data.amount || 0}.`,
    },
  }),

  DISPUTE_RAISED: (data = {}) => ({
    title: {
      mr: "वाद नोंदवला गेला",
      hi: "विवाद दर्ज किया गया",
      en: "Dispute Raised",
    },
    body: {
      mr: `"${data.jobTitle || "नोकरी"}" संदर्भात एक वाद नोंदवला गेला आहे.`,
      hi: `"${data.jobTitle || "नौकरी"}" के संबंध में एक विवाद दर्ज किया गया है।`,
      en: `A dispute has been raised regarding "${data.jobTitle || "Job"}".`,
    },
  }),

  NEW_MESSAGE: (data = {}) => ({
    title: {
      mr: `नवीन संदेश - ${data.senderName || "वापरकर्ता"}`,
      hi: `नया संदेश - ${data.senderName || "उपयोगकर्ता"}`,
      en: `New Message from ${data.senderName || "User"}`,
    },
    body: {
      mr: data.messageText || "तुम्हाला एक नवीन संदेश प्राप्त झाला आहे.",
      hi: data.messageText || "आपको एक नया संदेश प्राप्त हुआ है।",
      en: data.messageText || "You have received a new message.",
    },
  }),
};

/**
 * Build a trilingual notification payload.
 *
 * @param {string} templateKey - Key corresponding to NOTIFICATION_TEMPLATES
 * @param {Object} data - Context data for template interpolation
 * @param {Object} [customTitle] - Optional custom trilingual title override { mr, hi, en }
 * @param {Object} [customBody] - Optional custom trilingual body override { mr, hi, en }
 * @returns {{ title: { mr: string, hi: string, en: string }, body: { mr: string, hi: string, en: string } }}
 */
const buildTrilingualNotification = (templateKey, data = {}, customTitle = null, customBody = null) => {
  if (customTitle && customBody) {
    return { title: customTitle, body: customBody };
  }

  const builder = NOTIFICATION_TEMPLATES[templateKey];
  if (builder) {
    return builder(data);
  }

  // Generic fallback if template key does not match
  return {
    title: {
      mr: customTitle?.mr || data.title || "अधिसूचना",
      hi: customTitle?.hi || data.title || "अधिसूचना",
      en: customTitle?.en || data.title || "Notification",
    },
    body: {
      mr: customBody?.mr || data.body || "",
      hi: customBody?.hi || data.body || "",
      en: customBody?.en || data.body || "",
    },
  };
};

export { buildTrilingualNotification, NOTIFICATION_TEMPLATES };
