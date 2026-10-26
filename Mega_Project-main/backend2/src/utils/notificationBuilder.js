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

  APPLICATION_SUBMITTED: (data = {}) => ({
    title: {
      mr: `नवीन अर्ज: ${data.jobTitle || "नोकरी"}`,
      hi: `नया आवेदन: ${data.jobTitle || "नौकरी"}`,
      en: `New Application: ${data.jobTitle || "Job"}`,
    },
    body: {
      mr: `${data.workerName || "एका कामगाराने"} "${data.jobTitle || "नोकरी"}" साठी अर्ज केला आहे.`,
      hi: `${data.workerName || "एक श्रमिक ने"} "${data.jobTitle || "नौकरी"}" के लिए आवेदन किया है।`,
      en: `${data.workerName || "A worker"} has applied for "${data.jobTitle || "Job"}".`,
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

  APPLICATION_COMPLETED: (data = {}) => ({
    title: {
      mr: "काम पूर्ण झाले",
      hi: "काम पूरा हुआ",
      en: "Job Completed",
    },
    body: {
      mr: `"${data.jobTitle || "नोकरी"}" यशस्वीरित्या पूर्ण म्हणून नोंदवले गेले आहे.`,
      hi: `"${data.jobTitle || "नौकरी"}" को सफलतापूर्वक पूरा चिह्नित किया गया है।`,
      en: `"${data.jobTitle || "Job"}" has been marked as completed.`,
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

  DISPUTE_RESOLVED: (data = {}) => ({
    title: {
      mr: "वाद निराकरण",
      hi: "विवाद समाधान",
      en: "Dispute Resolved",
    },
    body: {
      mr: `"${data.jobTitle || "नोकरी"}" संदर्भातील वाद प्रशासकाद्वारे सोडवला गेला आहे.`,
      hi: `"${data.jobTitle || "नौकरी"}" के संबंध में विवाद प्रशासक द्वारा हल कर दिया गया है।`,
      en: `The dispute regarding "${data.jobTitle || "Job"}" has been resolved by an administrator.`,
    },
  }),

  DISPUTE_STATUS_UPDATED: (data = {}) => ({
    title: {
      mr: "वाद स्थिती अद्यतन",
      hi: "विवाद स्थिति अद्यतन",
      en: "Dispute Status Update",
    },
    body: {
      mr: `विवादाची स्थिती "${data.status || "अद्यतनित"}" अशी अद्यतनित करण्यात आली आहे.`,
      hi: `विवाद की स्थिति "${data.status || "अपडेट"}" के रूप में अपडेट की गई है।`,
      en: `Dispute status has been updated to "${data.status || "Updated"}".`,
    },
  }),

  SYSTEM_ANNOUNCEMENT: (data = {}) => ({
    title: {
      mr: data.titleMr || data.title || "प्लॅटफॉर्म घोषणा",
      hi: data.titleHi || data.title || "प्लेटफ़ॉर्म घोषणा",
      en: data.titleEn || data.title || "Platform Announcement",
    },
    body: {
      mr: data.bodyMr || data.body || "महत्त्वाची प्रशासकीय सूचना.",
      hi: data.bodyHi || data.body || "महत्वपूर्ण प्रशासनिक सूचना।",
      en: data.bodyEn || data.body || "Important platform announcement.",
    },
  }),

  NEW_MESSAGE: (data = {}) => ({
    title: {
      mr: `नवीन संदेश - ${data.senderName || "वापरकर्ता"}`,
      hi: `नया संदेश - ${data.senderName || "उपयोगकर्ता"}`,
      en: `New Message from ${data.senderName || "User"}`,
    },
    body: {
      mr: data.messageTextMr || data.messageText || "तुम्हाला एक नवीन संदेश प्राप्त झाला आहे.",
      hi: data.messageTextHi || data.messageText || "आपको एक नया संदेश प्राप्त हुआ है।",
      en: data.messageTextEn || data.messageText || "You have received a new message.",
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
