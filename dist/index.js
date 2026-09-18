"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAndCleanCloudinaryPublicIds = exports.deleteCloudinaryImages = exports.verifyFBToken = void 0;
const express_1 = __importDefault(require("express"));
const mongodb_1 = require("mongodb");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_dns_1 = __importDefault(require("node:dns"));
const cloudinary_1 = require("cloudinary");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
dotenv_1.default.config();
// Initialize Firebase Admin SDK from base64 service key (as in Miami Beach Resort)
if (process.env.FB_SERVICE_KEY) {
    try {
        const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        (0, app_1.initializeApp)({
            credential: (0, app_1.cert)(serviceAccount)
        });
        console.log("Firebase Admin initialized successfully");
    }
    catch (e) {
        console.log("Firebase Admin init error:", e.message);
    }
}
/**
 * Firebase ID Token verification middleware (as in Miami Beach Resort)
 */
const verifyFBToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "Unauthorized access: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decodedUser = await (0, auth_1.getAuth)().verifyIdToken(token);
        req.user = decodedUser;
        req.decodedEmail = decodedUser.email;
        req.decodedUid = decodedUser.uid;
        next();
    }
    catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(401).send({ message: "Unauthorized access: Invalid or expired token" });
    }
};
exports.verifyFBToken = verifyFBToken;
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
/**
 * Safely delete assets from Cloudinary by public ID
 */
const deleteCloudinaryImages = async (publicIds) => {
    const validIds = publicIds.filter((id) => typeof id === "string" && id.trim().length > 0);
    if (validIds.length === 0)
        return;
    if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.warn("[Cloudinary] Warning: CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET is not configured in .env. Skipping Cloudinary asset deletion.");
        return;
    }
    try {
        const results = await Promise.allSettled(validIds.map((publicId) => cloudinary_1.v2.uploader.destroy(publicId)));
        console.log(`[Cloudinary] Processed deletion for ${validIds.length} assets:`, results);
    }
    catch (error) {
        console.error("[Cloudinary] Failed to delete assets:", error);
    }
};
exports.deleteCloudinaryImages = deleteCloudinaryImages;
/**
 * Extract publicId from pitcher or moderator document and delete them from Cloudinary
 */
const extractAndCleanCloudinaryPublicIds = async (doc) => {
    if (!doc)
        return;
    const ids = [];
    // Profile photo publicId
    if (doc.image?.publicId) {
        ids.push(doc.image.publicId);
    }
    else if (doc.publicId) {
        ids.push(doc.publicId);
    }
    // NID card publicIds
    if (Array.isArray(doc.NID)) {
        for (const item of doc.NID) {
            if (item?.publicId) {
                ids.push(item.publicId);
            }
        }
    }
    if (ids.length > 0) {
        await (0, exports.deleteCloudinaryImages)(ids);
    }
};
exports.extractAndCleanCloudinaryPublicIds = extractAndCleanCloudinaryPublicIds;
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const port = process.env.PORT || 5000;
// URL normalization for Vercel rewrites (/api -> /)
app.use((req, _res, next) => {
    if (req.url.startsWith('/api')) {
        req.url = req.url.replace(/^\/api/, '') || '/';
    }
    next();
});
let isShutdown = false;
// Emergency Kill Switch Middleware
app.use((req, res, next) => {
    // Whitelist root test route and kill_switch API endpoints
    if (req.path === '/' || req.path === '/api' || req.path.startsWith('/kill_switch')) {
        return next();
    }
    if (isShutdown) {
        return res.status(503).json({
            error: "SYSTEM_OFFLINE",
            message: "System is currently offline due to administrative lockdown.",
            isShutdown: true
        });
    }
    next();
});
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try {
        node_dns_1.default.setServers([
            "8.8.8.8",
            "1.1.1.1"
        ]);
    }
    catch (e) {
        console.warn("DNS setServers warning:", e.message);
    }
}
const shareLinkToImageUrl = async (shareLink) => {
    const { url } = await fetch(shareLink, { redirect: "follow" });
    const profileImage = `https://graph.facebook.com/v23.0${new URL(url).pathname}/picture`;
    console.log(profileImage);
    return profileImage;
};
app.get('/', async (req, res) => {
    res.send('Hello World!');
});
app.get('/api', async (req, res) => {
    res.send('Hello World!');
});
const uri = process.env.URI || "";
if (!uri) {
    console.warn("WARNING: URI is not defined in environment variables. Make sure URI is configured in Vercel Project Settings > Environment Variables.");
}
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = uri
    ? new mongodb_1.MongoClient(uri, {
        serverApi: {
            version: mongodb_1.ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    })
    : null;
// all handled in my entire life 
// console.log(new Date("2026-09-05"))
async function run() {
    if (!client) {
        console.warn("MongoDB client is not initialized because URI is missing.");
        return;
    }
    try {
        const database = client.db("Nj_Multi_Agency");
        const usersCollection = database.collection("users");
        const pitchersCollection = database.collection("pitchers");
        const moderatorsCollection = database.collection("moderators");
        const tasksCollection = database.collection("tasks");
        const systemSettingsCollection = database.collection("system_settings");
        // Initialize in-memory kill switch status from MongoDB
        try {
            const config = await systemSettingsCollection.findOne({ key: "kill_switch" });
            if (config && typeof config.isShutdown === "boolean") {
                isShutdown = config.isShutdown;
            }
        }
        catch (err) {
            console.error("Failed to load initial kill_switch state:", err);
        }
        // kill_switch __________________________________
        app.get("/kill_switch", (_req, res) => {
            res.send({ isShutdown });
        });
        app.post("/kill_switch", async (req, res) => {
            const { username, password, action } = req.body;
            const EXPECTED_USER = "the_latest_version_of_human";
            const EXPECTED_PASS = "#foREvER%killnjmultiagency";
            if (username !== EXPECTED_USER || password !== EXPECTED_PASS) {
                return res.status(401).send({
                    success: false,
                    error: "UNAUTHORIZED",
                    message: "Invalid clearance credentials."
                });
            }
            if (action === "shutdown") {
                isShutdown = true;
            }
            else if (action === "restore") {
                isShutdown = false;
            }
            else {
                isShutdown = !isShutdown;
            }
            try {
                await systemSettingsCollection.updateOne({ key: "kill_switch" }, { $set: { isShutdown, updatedAt: new Date() } }, { upsert: true });
            }
            catch (err) {
                console.error("Failed to persist kill_switch state:", err);
            }
            res.send({
                success: true,
                isShutdown,
                message: isShutdown
                    ? "Site kill switch activated. All APIs blocked."
                    : "Site restored. Normal operations resumed."
            });
        });
        // user ________________________________________
        app.get("/users", async (req, res) => {
            const { search } = req.query;
            let query = { role: "user" };
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                };
                query = { ...query, ...searchQuery };
            }
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });
        app.post("/users", async (req, res) => {
            const user = req.body;
            user.createdAt = new Date();
            user.updatedAt = new Date();
            user.role = "user";
            // Check if user already exists
            const existingUser = await usersCollection.findOne({ uid: user.uid });
            if (existingUser) {
                return res.send({
                    message: "User already exists",
                    user: existingUser
                });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        // employee ____________________________________________
        app.post("/employee", async (req, res) => {
            const employee = req.body;
            employee.createdAt = new Date();
            employee.updatedAt = new Date();
            employee.status = 'active';
            await usersCollection.updateOne({ uid: employee.uid }, { $set: { role: employee.role } });
            if (employee.role === "pitcher") {
                const result = await pitchersCollection.insertOne(employee);
                res.send(result);
            }
            if (employee.role === "moderator") {
                const result = await moderatorsCollection.insertOne(employee);
                res.send(result);
            }
        });
        // pitchers ___________________________
        app.get("/pitcher/:id", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new mongodb_1.ObjectId(id) };
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const result = await pitchersCollection.aggregate([
                { $match: query },
                {
                    $lookup: {
                        from: "tasks",
                        localField: "uid",
                        foreignField: "assignedTo",
                        as: "assignedTasks"
                    }
                },
                {
                    $addFields: {
                        totalClientsHandled: { $size: "$assignedTasks" },
                        successfullyHandledClient: {
                            $size: {
                                $filter: {
                                    input: "$assignedTasks",
                                    as: "task",
                                    cond: { $eq: ["$$task.status", "completed"] }
                                }
                            }
                        },
                        activePitches: {
                            $size: {
                                $filter: {
                                    input: "$assignedTasks",
                                    as: "task",
                                    cond: {
                                        $and: [
                                            { $gte: ["$$task.createdAt", today] },
                                            { $lt: ["$$task.createdAt", tomorrow] },
                                            { $ne: ["$$task.status", "completed"] }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        successRate: {
                            $cond: [
                                { $eq: ["$totalClientsHandled", 0] },
                                0,
                                {
                                    $round: [
                                        {
                                            $multiply: [
                                                { $divide: ["$successfullyHandledClient", "$totalClientsHandled"] },
                                                100
                                            ]
                                        },
                                        2
                                    ]
                                }
                            ]
                        },
                        avgClientPerMonth: 0
                    }
                },
                { $project: { assignedTasks: 0 } }
            ]).toArray();
            res.send(result[0] || null);
        });
        app.get("/pitchers", async (req, res) => {
            const { search, moderatorUid } = req.query;
            let query = {};
            if (moderatorUid) {
                query.moderatorUid = moderatorUid;
            }
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                };
                query = { ...query, ...searchQuery };
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const result = await pitchersCollection.aggregate([
                { $match: query },
                { $sort: { _id: -1 } },
                {
                    $lookup: {
                        from: "tasks",
                        localField: "uid",
                        foreignField: "assignedTo",
                        as: "assignedTasks"
                    }
                },
                {
                    $addFields: {
                        totalClientsHandled: { $size: "$assignedTasks" },
                        successfullyHandledClient: {
                            $size: {
                                $filter: {
                                    input: "$assignedTasks",
                                    as: "task",
                                    cond: { $eq: ["$$task.status", "completed"] }
                                }
                            }
                        },
                        activePitches: {
                            $size: {
                                $filter: {
                                    input: "$assignedTasks",
                                    as: "task",
                                    cond: {
                                        $and: [
                                            { $gte: ["$$task.createdAt", today] },
                                            { $lt: ["$$task.createdAt", tomorrow] },
                                            { $ne: ["$$task.status", "completed"] }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        successRate: {
                            $cond: [
                                { $eq: ["$totalClientsHandled", 0] },
                                0,
                                {
                                    $round: [
                                        {
                                            $multiply: [
                                                { $divide: ["$successfullyHandledClient", "$totalClientsHandled"] },
                                                100
                                            ]
                                        },
                                        2
                                    ]
                                }
                            ]
                        },
                        avgClientPerMonth: 0
                    }
                },
                { $project: { assignedTasks: 0 } }
            ]).toArray();
            res.send(result);
        });
        app.post("/pitcher", async (req, res) => {
            const pitcher = req.body;
            pitcher.createdAt = new Date();
            pitcher.updatedAt = new Date();
            pitcher.role = "pitcher";
            pitcher.status = 'active';
            await usersCollection.updateOne({ uid: pitcher.uid }, { $set: { role: pitcher.role } });
            const result = await pitchersCollection.insertOne(pitcher);
            res.send(result);
        });
        app.patch("/pitcher/:id", async (req, res) => {
            const { id } = req.params;
            const data = { ...req.body };
            delete data._id;
            data.updatedAt = new Date();
            if (data.joinedAt)
                data.joinedAt = new Date(data.joinedAt);
            const query = { _id: new mongodb_1.ObjectId(id) };
            const result = await pitchersCollection.updateOne(query, { $set: data });
            res.send(result);
        });
        app.delete("/pitcher/:uid", exports.verifyFBToken, async (req, res) => {
            const uid = req.params;
            const requesterEmail = (req.query.requesterEmail || req.headers["x-requester-email"]);
            if (requesterEmail) {
                const requester = await usersCollection.findOne({ email: requesterEmail });
                if (requester && requester.role !== "admin") {
                    return res.status(403).send({ message: "Forbidden: Only administrators can delete pitchers" });
                }
            }
            // Find pitcher before deleting to remove images and NID cards from Cloudinary
            const pitcher = await pitchersCollection.findOne(uid);
            if (pitcher) {
                await (0, exports.extractAndCleanCloudinaryPublicIds)(pitcher);
            }
            await usersCollection.updateOne(uid, { $set: { role: "user" } });
            const result = await pitchersCollection.deleteOne(uid);
            res.send(result);
        });
        // GET pitchers that are free OR already assigned to a specific moderator (for the assign modal)
        app.get("/pitchers/assignable", async (req, res) => {
            const { moderatorUid, search } = req.query;
            let query = {
                $or: [
                    { moderatorUid: { $exists: false } },
                    { moderatorUid: "" },
                    { moderatorUid: null },
                    { moderatorUid: moderatorUid }
                ]
            };
            if (search) {
                query = {
                    ...query,
                    $and: [
                        {
                            $or: [
                                { name: { $regex: search, $options: "i" } },
                                { email: { $regex: search, $options: "i" } }
                            ]
                        }
                    ]
                };
            }
            const result = await pitchersCollection.find(query, {
                projection: { name: 1, email: 1, uid: 1, image: 1, moderatorUid: 1, status: 1 }
            }).sort({ _id: -1 }).toArray();
            res.send(result);
        });
        // GET pitchers already assigned to a specific moderator
        app.get("/pitchers/by-moderator", async (req, res) => {
            const { moderatorUid } = req.query;
            const result = await pitchersCollection.find({ moderatorUid }, {
                projection: { name: 1, email: 1, uid: 1, image: 1, moderatorUid: 1, status: 1 }
            }).toArray();
            res.send(result);
        });
        // PATCH assign/unassign pitchers to a moderator
        app.patch("/pitchers/assign-moderator", async (req, res) => {
            const { pitcherUids, moderatorUid } = req.body;
            // set moderatorUid for newly assigned pitchers
            const result = await pitchersCollection.updateMany({ uid: { $in: pitcherUids } }, { $set: { moderatorUid } });
            res.send(result);
        });
        // PATCH unassign a single pitcher from moderator
        app.patch("/pitchers/unassign-moderator", async (req, res) => {
            const { pitcherUid } = req.body;
            const result = await pitchersCollection.updateOne({ uid: pitcherUid }, { $set: { moderatorUid: "" } });
            res.send(result);
        });
        // moderators __________________________________________
        app.get("/moderators/:id", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new mongodb_1.ObjectId(id) };
            const result = await moderatorsCollection.aggregate([
                { $match: query },
                {
                    $lookup: {
                        from: "tasks",
                        let: { moderatorUid: "$uid" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $or: [
                                            { $eq: ["$assignedBy", "$$moderatorUid"] },
                                            { $eq: ["$assignedByUid", "$$moderatorUid"] },
                                            { $eq: ["$moderatorUid", "$$moderatorUid"] },
                                            { $eq: ["$createdBy", "$$moderatorUid"] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "assignedTasks"
                    }
                },
                {
                    $addFields: {
                        totalAssignedTasks: { $size: "$assignedTasks" },
                        lastAssignedAt: {
                            $cond: [
                                { $eq: [{ $size: "$assignedTasks" }, 0] },
                                "",
                                { $max: "$assignedTasks.createdAt" }
                            ]
                        }
                    }
                },
                { $project: { assignedTasks: 0 } }
            ]).toArray();
            res.send(result[0] || null);
        });
        app.get("/moderators", async (req, res) => {
            const { search } = req.query;
            let query = {};
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                };
                query = { ...query, ...searchQuery };
            }
            const result = await moderatorsCollection.aggregate([
                { $match: query },
                { $sort: { _id: -1 } },
                {
                    $lookup: {
                        from: "tasks",
                        let: { moderatorUid: "$uid" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $or: [
                                            { $eq: ["$assignedBy", "$$moderatorUid"] },
                                            { $eq: ["$assignedByUid", "$$moderatorUid"] },
                                            { $eq: ["$moderatorUid", "$$moderatorUid"] },
                                            { $eq: ["$createdBy", "$$moderatorUid"] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "assignedTasks"
                    }
                },
                {
                    $addFields: {
                        totalAssignedTasks: { $size: "$assignedTasks" },
                        lastAssignedAt: {
                            $cond: [
                                { $eq: [{ $size: "$assignedTasks" }, 0] },
                                "",
                                { $max: "$assignedTasks.createdAt" }
                            ]
                        }
                    }
                },
                { $project: { assignedTasks: 0 } }
            ]).toArray();
            res.send(result);
        });
        app.patch("/moderator/:id", async (req, res) => {
            const { id } = req.params;
            const data = { ...req.body };
            delete data._id;
            data.updatedAt = new Date();
            if (data.joinedAt)
                data.joinedAt = new Date(data.joinedAt);
            const query = { _id: new mongodb_1.ObjectId(id) };
            const result = await moderatorsCollection.updateOne(query, { $set: data });
            res.send(result);
        });
        app.delete("/moderator/:uid", exports.verifyFBToken, async (req, res) => {
            const uid = req.params;
            // Find moderator before deleting to remove images and NID cards from Cloudinary
            const moderator = await moderatorsCollection.findOne(uid);
            if (moderator) {
                await (0, exports.extractAndCleanCloudinaryPublicIds)(moderator);
            }
            await usersCollection.updateOne(uid, { $set: { role: "user" } });
            const result = await moderatorsCollection.deleteOne(uid);
            res.send(result);
        });
        // Tasks Apis  _________________________________
        app.get("/tasks", async (req, res) => {
            const { uid, search, status } = req.query;
            // console.log(email)
            let query = { assignedTo: uid };
            if (search) {
                const searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } }
                    ]
                };
                query = { ...query, ...searchQuery };
            }
            if (status) {
                query.status = status;
            }
            const result = await tasksCollection.find(query).toArray();
            res.send(result);
        });
        app.get("/todays_tasks", async (req, res) => {
            const { uid } = req.query;
            console.log(uid);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const query = {
                assignedTo: uid,
                $or: [
                    {
                        createdAt: {
                            $gte: today,
                            $lt: tomorrow
                        }
                    },
                    { "postpone.postponeAt": { $gte: today, $lt: tomorrow } }
                ]
            };
            const result = await tasksCollection.find(query).toArray();
            res.send(result);
        });
        app.patch("/task/:id", async (req, res) => {
            const { id } = req.params;
            const { status, postponeAt, postponeNote, ...rest } = req.body;
            const query = { _id: new mongodb_1.ObjectId(id) };
            delete rest._id;
            let update = { $set: { ...rest, updatedAt: new Date() } };
            if (status) {
                update.$set.status = status;
                if (status === "completed") {
                    update.$set.completedAt = new Date();
                }
            }
            if (postponeAt) {
                const postponeDate = new Date(postponeAt);
                if (Number.isNaN(postponeDate.getTime())) {
                    return res.status(400).send({ message: "Invalid postponeAt date" });
                }
                update.$push = {
                    postpone: {
                        postponeAt: postponeDate.toISOString(),
                        postponeNote: postponeNote || ""
                    }
                };
            }
            const result = await tasksCollection.updateOne(query, update);
            res.send(result);
        });
        // Mark client task as paid with commission calculation (15% pitcher, 5% moderator, 80% agency)
        app.patch("/task/mark-paid/:id", async (req, res) => {
            const { id } = req.params;
            const { balance } = req.body;
            const numBalance = Number(balance);
            if (isNaN(numBalance) || numBalance <= 0) {
                return res.status(400).send({ message: "Invalid balance amount" });
            }
            const pitcherEarning = Math.round(numBalance * 0.15 * 100) / 100;
            const moderatorEarning = Math.round(numBalance * 0.05 * 100) / 100;
            const agencyEarning = Math.round((numBalance - pitcherEarning - moderatorEarning) * 100) / 100;
            const query = { _id: new mongodb_1.ObjectId(id) };
            const update = {
                $set: {
                    status: "completed",
                    paymentStatus: "paid",
                    balance: numBalance,
                    pitcherEarning,
                    moderatorEarning,
                    agencyEarning,
                    pitcherPaidStatus: "unpaid",
                    moderatorPaidStatus: "unpaid",
                    paidAt: new Date(),
                    completedAt: new Date(),
                    updatedAt: new Date()
                }
            };
            const result = await tasksCollection.updateOne(query, update);
            res.send(result);
        });
        app.post("/task", async (req, res) => {
            const task = req.body;
            task.status = "pending";
            task.createdAt = new Date();
            task.updatedAt = new Date();
            task.photoUrl = await shareLinkToImageUrl(task.url) || "";
            task.postpone = [];
            const result = await tasksCollection.insertOne(task);
            res.send(result);
        });
        // admin clients
        app.get("/admin/clients", async (req, res) => {
            const { search, status } = req.query;
            let query = {};
            if (search) {
                query = {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } },
                        { numbers: { $regex: search, $options: "i" } }
                    ]
                };
            }
            if (status) {
                query.status = status;
            }
            const result = await tasksCollection.find(query).sort({ _id: -1 }).toArray();
            res.send(result);
        });
        // admin overview stats & rankings
        app.get("/admin/overview-stats", async (req, res) => {
            const allTasks = await tasksCollection.find({}).toArray();
            const allPitchers = await pitchersCollection.find({}).toArray();
            const allModerators = await moderatorsCollection.find({}).toArray();
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            let totalRevenue = 0;
            let totalPitcherPayouts = 0;
            let totalModeratorPayouts = 0;
            let totalAgencyProfit = 0;
            let unpaidPitcherPayouts = 0;
            let unpaidModeratorPayouts = 0;
            let totalTasks = allTasks.length;
            let completedTasks = 0;
            let paidTasks = 0;
            let pendingTasks = 0;
            let rejectedTasks = 0;
            let postponedTasks = 0;
            allTasks.forEach(task => {
                const s = (task.status || "pending").toLowerCase();
                if (s === "completed" || s === "complete")
                    completedTasks++;
                else if (s === "rejected" || s === "reject")
                    rejectedTasks++;
                else if (s === "postponed" || s === "postpone")
                    postponedTasks++;
                else
                    pendingTasks++;
                if (task.paymentStatus === "paid" || task.balance) {
                    paidTasks++;
                    const b = Number(task.balance) || 0;
                    totalRevenue += b;
                    const pEarn = Number(task.pitcherEarning) || Math.round(b * 0.15 * 100) / 100;
                    const mEarn = Number(task.moderatorEarning) || Math.round(b * 0.05 * 100) / 100;
                    const aEarn = Number(task.agencyEarning) || Math.round((b - pEarn - mEarn) * 100) / 100;
                    totalPitcherPayouts += pEarn;
                    totalModeratorPayouts += mEarn;
                    totalAgencyProfit += aEarn;
                    if (task.pitcherPaidStatus !== "paid") {
                        unpaidPitcherPayouts += pEarn;
                    }
                    if (task.moderatorPaidStatus !== "paid") {
                        unpaidModeratorPayouts += mEarn;
                    }
                }
            });
            // Pitcher Rankings
            const pitcherRankings = allPitchers.map(p => {
                const pTasks = allTasks.filter(t => t.assignedTo === p.uid);
                const totalHandled = pTasks.length;
                const completedAll = pTasks.filter(t => (t.status || "").toLowerCase() === "completed" || t.paymentStatus === "paid");
                const completedThisMonth = pTasks.filter(t => {
                    const isComp = (t.status || "").toLowerCase() === "completed" || t.paymentStatus === "paid";
                    if (!isComp)
                        return false;
                    const d = t.completedAt ? new Date(t.completedAt) : (t.updatedAt ? new Date(t.updatedAt) : new Date(t.createdAt));
                    return d >= startOfMonth;
                }).length;
                const revenueGenerated = pTasks.reduce((sum, t) => sum + (Number(t.balance) || 0), 0);
                const earnings = pTasks.reduce((sum, t) => sum + (Number(t.pitcherEarning) || 0), 0);
                const successRate = totalHandled === 0 ? 0 : Math.round((completedAll.length / totalHandled) * 100);
                return {
                    _id: p._id,
                    uid: p.uid,
                    name: p.name,
                    email: p.email,
                    image: p.image,
                    status: p.status,
                    totalHandled,
                    completedAll: completedAll.length,
                    completedThisMonth,
                    revenueGenerated: Math.round(revenueGenerated * 100) / 100,
                    earnings: Math.round(earnings * 100) / 100,
                    successRate
                };
            }).sort((a, b) => b.completedThisMonth - a.completedThisMonth || b.revenueGenerated - a.revenueGenerated);
            // Moderator Rankings
            const moderatorRankings = allModerators.map(m => {
                const mTasks = allTasks.filter(t => t.assignedBy === m.uid || t.assignedByUid === m.uid || t.moderatorUid === m.uid || t.createdBy === m.uid);
                const totalAssigned = mTasks.length;
                const completedTasksCount = mTasks.filter(t => (t.status || "").toLowerCase() === "completed" || t.paymentStatus === "paid").length;
                const revenueGenerated = mTasks.reduce((sum, t) => sum + (Number(t.balance) || 0), 0);
                const earnings = mTasks.reduce((sum, t) => sum + (Number(t.moderatorEarning) || 0), 0);
                return {
                    _id: m._id,
                    uid: m.uid,
                    name: m.name,
                    email: m.email,
                    image: m.image,
                    status: m.status,
                    totalAssigned,
                    completedTasks: completedTasksCount,
                    revenueGenerated: Math.round(revenueGenerated * 100) / 100,
                    earnings: Math.round(earnings * 100) / 100
                };
            }).sort((a, b) => b.completedTasks - a.completedTasks || b.revenueGenerated - a.revenueGenerated);
            res.send({
                financials: {
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    totalPitcherPayouts: Math.round(totalPitcherPayouts * 100) / 100,
                    totalModeratorPayouts: Math.round(totalModeratorPayouts * 100) / 100,
                    totalAgencyProfit: Math.round(totalAgencyProfit * 100) / 100,
                    unpaidPitcherPayouts: Math.round(unpaidPitcherPayouts * 100) / 100,
                    unpaidModeratorPayouts: Math.round(unpaidModeratorPayouts * 100) / 100,
                    totalUnpaidPayouts: Math.round((unpaidPitcherPayouts + unpaidModeratorPayouts) * 100) / 100
                },
                counts: {
                    totalTasks,
                    completedTasks,
                    paidTasks,
                    pendingTasks,
                    rejectedTasks,
                    postponedTasks,
                    totalPitchers: allPitchers.length,
                    totalModerators: allModerators.length
                },
                pitcherRankings,
                moderatorRankings
            });
        });
        // moderator overview stats & rankings
        app.get("/moderator/overview-stats", async (req, res) => {
            const { moderatorUid } = req.query;
            if (!moderatorUid) {
                return res.status(400).send({ message: "moderatorUid is required" });
            }
            const allTasks = await tasksCollection.find({}).toArray();
            const assignedPitchers = await pitchersCollection.find({ moderatorUid }).toArray();
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const modTasks = allTasks.filter(t => t.assignedBy === moderatorUid || t.assignedByUid === moderatorUid || t.moderatorUid === moderatorUid || t.createdBy === moderatorUid);
            let totalAssigned = modTasks.length;
            let completedTasksCount = 0;
            let totalRevenue = 0;
            let totalModeratorEarnings = 0;
            let paidEarnings = 0;
            let unpaidEarnings = 0;
            modTasks.forEach(t => {
                const isComp = (t.status || "").toLowerCase() === "completed" || t.paymentStatus === "paid";
                if (isComp)
                    completedTasksCount++;
                if (t.paymentStatus === "paid" || t.balance) {
                    const b = Number(t.balance) || 0;
                    totalRevenue += b;
                    const mEarn = Number(t.moderatorEarning) || Math.round(b * 0.05 * 100) / 100;
                    totalModeratorEarnings += mEarn;
                    if (t.moderatorPaidStatus === "paid") {
                        paidEarnings += mEarn;
                    }
                    else {
                        unpaidEarnings += mEarn;
                    }
                }
            });
            // Pitcher rankings under this moderator
            const pitcherRankings = assignedPitchers.map(p => {
                const pTasks = allTasks.filter(t => t.assignedTo === p.uid);
                const totalHandled = pTasks.length;
                const completedAll = pTasks.filter(t => (t.status || "").toLowerCase() === "completed" || t.paymentStatus === "paid");
                const completedThisMonth = pTasks.filter(t => {
                    const isComp = (t.status || "").toLowerCase() === "completed" || t.paymentStatus === "paid";
                    if (!isComp)
                        return false;
                    const d = t.completedAt ? new Date(t.completedAt) : (t.updatedAt ? new Date(t.updatedAt) : new Date(t.createdAt));
                    return d >= startOfMonth;
                }).length;
                const revenueGenerated = pTasks.reduce((sum, t) => sum + (Number(t.balance) || 0), 0);
                const earnings = pTasks.reduce((sum, t) => sum + (Number(t.pitcherEarning) || 0), 0);
                const successRate = totalHandled === 0 ? 0 : Math.round((completedAll.length / totalHandled) * 100);
                return {
                    _id: p._id,
                    uid: p.uid,
                    name: p.name,
                    email: p.email,
                    image: p.image,
                    status: p.status,
                    totalHandled,
                    completedAll: completedAll.length,
                    completedThisMonth,
                    revenueGenerated: Math.round(revenueGenerated * 100) / 100,
                    earnings: Math.round(earnings * 100) / 100,
                    successRate
                };
            }).sort((a, b) => b.completedThisMonth - a.completedThisMonth || b.revenueGenerated - a.revenueGenerated);
            res.send({
                stats: {
                    totalAssigned,
                    completedTasks: completedTasksCount,
                    assignedPitchersCount: assignedPitchers.length,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    totalModeratorEarnings: Math.round(totalModeratorEarnings * 100) / 100,
                    paidEarnings: Math.round(paidEarnings * 100) / 100,
                    unpaidEarnings: Math.round(unpaidEarnings * 100) / 100,
                },
                pitcherRankings
            });
        });
        // moderator assigned tasks history
        app.get("/moderator/assigned-tasks-history", async (req, res) => {
            const { moderatorUid, search, status } = req.query;
            if (!moderatorUid) {
                return res.status(400).send({ message: "moderatorUid is required" });
            }
            let query = {
                $or: [
                    { assignedBy: moderatorUid },
                    { assignedByUid: moderatorUid },
                    { moderatorUid: moderatorUid },
                    { createdBy: moderatorUid }
                ]
            };
            if (status) {
                query.status = status;
            }
            if (search) {
                query = {
                    ...query,
                    $and: [
                        {
                            $or: [
                                { name: { $regex: search, $options: "i" } },
                                { email: { $regex: search, $options: "i" } },
                                { numbers: { $regex: search, $options: "i" } }
                            ]
                        }
                    ]
                };
            }
            const tasks = await tasksCollection.find(query).sort({ _id: -1 }).toArray();
            const pitchers = await pitchersCollection.find({}).toArray();
            const pitcherMap = new Map(pitchers.map(p => [p.uid, p]));
            const results = tasks.map(t => ({
                ...t,
                pitcher: pitcherMap.get(t.assignedTo) || null
            }));
            res.send(results);
        });
        // admin payments list
        app.get("/admin/payments", async (req, res) => {
            const { role = "all", paymentStatus = "all", search = "", page = "1", limit = "20" } = req.query;
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.max(1, parseInt(limit) || 20);
            const allTasks = await tasksCollection.find({ paymentStatus: "paid" }).toArray();
            const allPitchers = await pitchersCollection.find({}).toArray();
            const allModerators = await moderatorsCollection.find({}).toArray();
            let employees = [];
            if (role === "all" || role === "pitcher") {
                allPitchers.forEach(p => {
                    const tasks = allTasks.filter(t => t.assignedTo === p.uid);
                    const totalEarned = tasks.reduce((sum, t) => sum + (Number(t.pitcherEarning) || 0), 0);
                    const paidBalance = tasks.filter(t => t.pitcherPaidStatus === "paid").reduce((sum, t) => sum + (Number(t.pitcherEarning) || 0), 0);
                    const unpaidBalance = tasks.filter(t => t.pitcherPaidStatus !== "paid").reduce((sum, t) => sum + (Number(t.pitcherEarning) || 0), 0);
                    const paidDealsCount = tasks.length;
                    const unpaidDealsCount = tasks.filter(t => t.pitcherPaidStatus !== "paid").length;
                    employees.push({
                        _id: p._id,
                        uid: p.uid,
                        name: p.name,
                        email: p.email,
                        phone: p.phone,
                        role: "pitcher",
                        image: p.image,
                        status: p.status,
                        totalEarned: Math.round(totalEarned * 100) / 100,
                        paidBalance: Math.round(paidBalance * 100) / 100,
                        unpaidBalance: Math.round(unpaidBalance * 100) / 100,
                        paidDealsCount,
                        unpaidDealsCount,
                        deals: tasks.map(t => ({
                            _id: t._id,
                            clientName: t.name,
                            balance: t.balance,
                            earning: t.pitcherEarning,
                            paidStatus: t.pitcherPaidStatus || "unpaid",
                            paidAt: t.paidAt || t.updatedAt || t.createdAt
                        }))
                    });
                });
            }
            if (role === "all" || role === "moderator") {
                allModerators.forEach(m => {
                    const tasks = allTasks.filter(t => t.assignedBy === m.uid || t.assignedByUid === m.uid || t.moderatorUid === m.uid || t.createdBy === m.uid);
                    const totalEarned = tasks.reduce((sum, t) => sum + (Number(t.moderatorEarning) || 0), 0);
                    const paidBalance = tasks.filter(t => t.moderatorPaidStatus === "paid").reduce((sum, t) => sum + (Number(t.moderatorEarning) || 0), 0);
                    const unpaidBalance = tasks.filter(t => t.moderatorPaidStatus !== "paid").reduce((sum, t) => sum + (Number(t.moderatorEarning) || 0), 0);
                    const paidDealsCount = tasks.length;
                    const unpaidDealsCount = tasks.filter(t => t.moderatorPaidStatus !== "paid").length;
                    employees.push({
                        _id: m._id,
                        uid: m.uid,
                        name: m.name,
                        email: m.email,
                        phone: m.phone,
                        role: "moderator",
                        image: m.image,
                        status: m.status,
                        totalEarned: Math.round(totalEarned * 100) / 100,
                        paidBalance: Math.round(paidBalance * 100) / 100,
                        unpaidBalance: Math.round(unpaidBalance * 100) / 100,
                        paidDealsCount,
                        unpaidDealsCount,
                        deals: tasks.map(t => ({
                            _id: t._id,
                            clientName: t.name,
                            balance: t.balance,
                            earning: t.moderatorEarning,
                            paidStatus: t.moderatorPaidStatus || "unpaid",
                            paidAt: t.paidAt || t.updatedAt || t.createdAt
                        }))
                    });
                });
            }
            // Filter by search
            if (search) {
                const s = search.toLowerCase();
                employees = employees.filter(e => (e.name || "").toLowerCase().includes(s) ||
                    (e.email || "").toLowerCase().includes(s) ||
                    (e.phone || "").toLowerCase().includes(s));
            }
            // Filter by paymentStatus: all | unpaid | paid
            if (paymentStatus === "unpaid") {
                employees = employees.filter(e => e.unpaidBalance > 0);
            }
            else if (paymentStatus === "paid") {
                employees = employees.filter(e => e.unpaidBalance === 0 && e.totalEarned > 0);
            }
            // Sort: UNPAID EMPLOYEES ALWAYS FIRST (highest unpaidBalance at the very top)
            employees.sort((a, b) => {
                if (a.unpaidBalance > 0 && b.unpaidBalance <= 0)
                    return -1;
                if (b.unpaidBalance > 0 && a.unpaidBalance <= 0)
                    return 1;
                if (a.unpaidBalance !== b.unpaidBalance)
                    return b.unpaidBalance - a.unpaidBalance;
                return b.totalEarned - a.totalEarned;
            });
            const totalEmployees = employees.length;
            const totalPages = Math.ceil(totalEmployees / limitNum) || 1;
            const paginatedEmployees = employees.slice((pageNum - 1) * limitNum, pageNum * limitNum);
            res.send({
                employees: paginatedEmployees,
                pagination: {
                    total: totalEmployees,
                    page: pageNum,
                    limit: limitNum,
                    totalPages
                }
            });
        });
        // admin pay employee action
        app.patch("/admin/pay-employee", async (req, res) => {
            const { employeeUid, role } = req.body;
            if (!employeeUid || !role) {
                return res.status(400).send({ message: "employeeUid and role are required" });
            }
            if (role === "pitcher") {
                const result = await tasksCollection.updateMany({ assignedTo: employeeUid, paymentStatus: "paid", pitcherPaidStatus: { $ne: "paid" } }, { $set: { pitcherPaidStatus: "paid", pitcherPaidAt: new Date() } });
                return res.send(result);
            }
            if (role === "moderator") {
                const result = await tasksCollection.updateMany({
                    $or: [
                        { assignedBy: employeeUid },
                        { assignedByUid: employeeUid },
                        { moderatorUid: employeeUid },
                        { createdBy: employeeUid }
                    ],
                    paymentStatus: "paid",
                    moderatorPaidStatus: { $ne: "paid" }
                }, { $set: { moderatorPaidStatus: "paid", moderatorPaidAt: new Date() } });
                return res.send(result);
            }
            res.status(400).send({ message: "Invalid role" });
        });
        // special ____________________________________________
        app.get("/role", exports.verifyFBToken, async (req, res) => {
            const rawEmail = req.decodedEmail || req.query.email;
            const queryEmail = typeof rawEmail === "string" ? rawEmail.trim() : "";
            const query = queryEmail ? { email: { $regex: new RegExp(`^${queryEmail}$`, "i") } } : req.query;
            const projection = { projection: { _id: 0, role: 1 } };
            const result = await usersCollection.findOne(query, projection);
            res.send(result);
        });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    }
    finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`);
    });
}
exports.default = app;
module.exports = app;
//# sourceMappingURL=index.js.map