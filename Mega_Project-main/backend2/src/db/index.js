import mongoose from "mongoose";
import {DB_NAME} from "../constants.js";

const connectDB= async () => {
    try{
        const baseUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
        const targetDb = process.env.DB_NAME || DB_NAME;
        const uri = /\/[^/?]+(\?|$)/.test(baseUri.replace(/^mongodb(\+srv)?:\/\//, ""))
          ? baseUri
          : `${baseUri}/${targetDb}`;
        const connectionInstance = await mongoose.connect(uri);
        console.log(`\n MongoDB connected !! DB HOST:${connectionInstance.connection.host} DB NAME:${connectionInstance.connection.name} `);
    }catch(error){
        console.log("error:", error);
        process.exit(1) 
                           
    }
}

export default connectDB