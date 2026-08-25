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


const shareLinkToImageUrl = async (shareLink: string) => {
    const { url } = await fetch(shareLink, { redirect: "follow" })
    const profileImage = `https://graph.facebook.com/v23.0${new URL(url).pathname}/picture`
    console.log(profileImage)
    return profileImage
}
app.get('/', async (req: Request, res: Response) => {
    // console.log()
    res.send('Hello World!');
});


const uri = process.env.URI;
if (!uri) {
    throw new Error("URI is not defined in environment variables")
}
// const uri = `mongodb+srv://Nj_Multi_Agency:fcLuV987C3VNybQR@cluster0.7hhwads.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
const fakeDataAboutPitcher = {
    totalClientsHandled: 0,
    successRate: 0,
    avgClientPerDay: 0,
    successfullyHandledClient: 0,
    activePitches: 0,
    // totalClientsHandled: 128,
    // successRate: 80,
    // avgClientPerDay: 4.2,
    // successfullyHandledClient: 102,
    // activePitches: 6,
    // status: "active"
}

const fakeDataAboutModerator = {
    totalAssignedTasks: 0, lastAssignedAt: ""
}

async function run() {
    try {
        const database = client.db("Nj_Multi_Agency")
        const usersCollection = database.collection("users")
        const pitchersCollection = database.collection("pitchers")
        const moderatorsCollection = database.collection("moderators")
        const tasksCollection = database.collection("tasks")


        // user ________________________________________
        app.get("/users", async (req, res) => {
            const { search } = req.query
            let query = { role: "user" }
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                }
                query = { ...query, ...searchQuery }

            }
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })
        app.post("/users", async (req, res) => {
            const user = req.body
            user.createdAt = new Date()
            user.updatedAt = new Date()
            user.role = "user"
            // Check if user already exists
            const existingUser = await usersCollection.findOne({ uid: user.uid })

            if (existingUser) {
                return res.send({
                    message: "User already exists",
                    user: existingUser
                })
            }

            const result = await usersCollection.insertOne(user)
            res.send(result)
        })
        // employee ____________________________________________

        app.post("/employee", async (req, res) => {
            const employee = req.body
            employee.createdAt = new Date()
            employee.updatedAt = new Date()
            employee.status = 'active'
            await usersCollection.updateOne({ uid: employee.uid }, { $set: { role: employee.role } })


            if (employee.role === "pitcher") {
                const result = await pitchersCollection.insertOne(employee)
                res.send(result)
            }
            if (employee.role === "moderator") {
                const result = await moderatorsCollection.insertOne(employee)
                res.send(result)
            }

        })
        // pitchers ___________________________
        app.get("/pitcher/:id", async (req, res) => {
            const { id } = req.params
            const query = { _id: new ObjectId(id) }
            const result = await pitchersCollection.findOne(query)

            res.send(result ? { ...result, ...fakeDataAboutPitcher } : result)
        })
        app.get("/pitchers", async (req, res) => {
            const { search } = req.query
            let query = {}
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                }
                query = { ...query, ...searchQuery }

            }
            const result = await pitchersCollection.find(query).sort({ _id: -1 }).toArray()
            const fakeResult = result.map((singleResult) => ({ ...singleResult, ...fakeDataAboutPitcher }))
            res.send(fakeResult)
        })

        app.post("/pitcher", async (req, res) => {
            const pitcher = req.body
            pitcher.createdAt = new Date()
            pitcher.updatedAt = new Date()
            pitcher.role = "pitcher"
            pitcher.status = 'active'
            await usersCollection.updateOne({ uid: pitcher.uid }, { $set: { role: pitcher.role } })
            const result = await pitchersCollection.insertOne(pitcher)
            res.send(result)
        })

        app.patch("/pitcher/:id", async (req, res) => {
            const { id } = req.params
            const status = req.body
            const update = {
                $set: status
            }
            const query = { _id: new ObjectId(id) }
            const result = await pitchersCollection.updateOne(query, update)
            res.send(result)

        })

        app.delete("/pitcher/:uid", async (req, res) => {
            const uid = req.params
            await usersCollection.updateOne(uid, { $set: { role: "user" } })
            const result = await pitchersCollection.deleteOne(uid)
            res.send(result)
        })
        // moderators __________________________________________
        app.get("/moderators", async (req, res) => {
            const { search } = req.query
            let query = {}
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                }
                query = { ...query, ...searchQuery }

            }
            const result = await moderatorsCollection.find(query).sort({ _id: -1 }).toArray()
            const fakeResult = result.map((newRes) => ({ ...newRes, ...fakeDataAboutModerator }))

            res.send(fakeResult)
        })
        // Tasks Apis  _________________________________

        app.get("/tasks", async (req, res) => {
            const { uid, search, status } = req.query
            // console.log(email)
            let query = { assignedTo: uid } as any
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                }
                query = { ...query, ...searchQuery }

            }
            if (status) {
                query.status = status
            }
            const result = await tasksCollection.find(query).toArray()
            res.send(result)

        })
        app.get("/todays_tasks", async (req, res) => {
            const { uid } = req.query
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const tomorrow = new Date(today)
            tomorrow.setDate(tomorrow.getDate() + 1)

            const query = {
                assignedTo: uid,
                createdAt: {
                    $gte: today,
                    $lt: tomorrow
                }
            }
            const result = await tasksCollection.find(query).toArray()
            res.send(result)
        })
        app.patch("/task/:id", async (req, res) => {
            const { id } = req.params
            const { status, postponeAt, postponeNote } = req.body
            const query = { _id: new ObjectId(id) }
            let update = { $set: { updatedAt: new Date() } as any, $push: {} }
            if (status) {
                // update = { $set: { status }, $push: {} }
                update.$set.status = status
            }
            if (postponeAt) {
                update.$push = {
                    postpone: {
                        postponeAt, postponeNote
                    }
                }
            }
            const result = await tasksCollection.updateOne(query, update)
            res.send(result)
        })
        app.post("/task", async (req, res) => {
            const task = req.body
            task.status = "pending"
            task.createdAt = new Date()
            task.updatedAt = new Date()
            task.photoUrl = await shareLinkToImageUrl(task.url) || ""
            task.postpone = []
            const result = await tasksCollection.insertOne(task)
            res.send(result)
        })
        // admin 
        app.get("/admin/clients", async (req, res) => {
            const { search, status } = req.query
            let query = {} as any
            if (search) {
                query = { name: { $regex: search, $options: "i" } }
            }
            if (status) {
                query.status = status
            }
            const result = await tasksCollection.find(query).toArray()
            res.send(result)
        })
        // special ____________________________________________

        app.get("/role", async (req, res) => {
            const email = req.query
            const projection = { projection: { _id: 0, role: 1 } }
            const result = await usersCollection.findOne(email, projection)
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