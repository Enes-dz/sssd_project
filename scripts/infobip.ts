
import { sendSMS } from "../src/utils/send_sms";

// My Phone number is placed as a default but you can parse it
const testSms = async (phoneNumber: string = "+387603168311", code: string = "999888") => {
  console.log("Sending test SMS...");
  try {
    const response = await sendSMS(phoneNumber, code);
    console.log("Response from Infobip:", response);
  } catch (err) {
    console.error("Test failed:", err);
  }
};

testSms();