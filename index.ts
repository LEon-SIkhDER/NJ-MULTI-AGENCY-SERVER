import express, { type Express, type Request, type Response } from 'express';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb'
import cors from "cors"
import dotenv from "dotenv"
import dns from "node:dns";
const app: Express = express();
app.use(cors())
dotenv.config()
app.use(express.json())
const port = process.env.PORT || 5000;

dns.setServers([
    "8.8.8.8",
    "1.1.1.1"
]);

app.get('/', async (req: Request, res: Response) => {

    res.send('Hello World!');
});

const shareLinkToImageUrl = async (shareLink: string) => {
    const { url } = await fetch(shareLink)
    const profileImage = `https://graph.facebook.com/v23.0${new URL(url).pathname}/picture`
    return profileImage
}


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.7hhwads.mongodb.net/?appName=Cluster0`;
// const uri = `mongodb+srv://Nj_Multi_Agency:fcLuV987C3VNybQR@cluster0.7hhwads.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const database = client.db("Nj_Multi_Agency")
        const usersCollection = database.collection("users")
        const pitchersCollection = database.collection("pitchers")


        // user ______________________
        app.post("/users", async (req, res) => {
            const user = req.body
            user.createdAt = new Date()
            user.updatedAt = new Date()
            user.role = "user"
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })
        // pitchers ___________________________
        app.get("/pitcher/:id", async (req, res) => {
            const { id } = req.params
            const query = { _id: new ObjectId(id) }
            const result = await pitchersCollection.findOne(query)
            res.send(result)
        })
        app.get("/pitchers", async (req, res) => {
            const result = await pitchersCollection.find().toArray()
            res.send(result)
        })
        app.post("/pitcher", async (req, res) => {
            const pitcher = req.body
            pitcher.createdAt = new Date()
            pitcher.updatedAt = new Date()
            pitcher.role = "pitcher"
            const result = await pitchersCollection.insertOne(pitcher)
            res.send(result)
        })









        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);











app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});