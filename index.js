const dotenv = require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
var ObjectId = require('mongodb').ObjectId;

var express = require('express');
var session = require('express-session');
var MongoDBStore = require('connect-mongodb-session')(session);

var app = express();
var bodyParser = require('body-parser');

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(session({
    secret: 'group-chat-qwerty',
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 1 week
    store: new MongoDBStore(
        {
            uri: process.env.MAIN_CLUSTER,
            databaseName: 'group-chat',
            collection: 'sessions'
        }),
    resave: true,
    saveUninitialized: true
}));

app.get('/', function (req, res) {
    res.send('Hello ' + JSON.stringify(req.session));
});

// app.get('/utils', async function (req, res) {
//     const client = new MongoClient(process.env.MAIN_CLUSTER);
//     await client.connect();
//     // await client.db("group-chat").collection("users").createIndex({ email_id: 1 }, { unique: true })
//     // const resp = await client.db("group-chat").collection("users").find({}).toArray()
//     const resp = await client.db("group-chat").collection("groups").find({}).toArray()
//     res.send(resp)
// });

app.post("/login", async function (req, res) {
    try {
        if (!req.body.email)
            throw new Error("Email ID cant be empty");
        if (!req.body.password)
            throw new Error("Password cant be empty");
        const password_hash = crypto.createHmac('sha256', req.body.password).digest('hex');
        const client = new MongoClient(process.env.MAIN_CLUSTER);
        await client.connect();
        const user = await client.db("group-chat").collection("users").findOne({
            email_id: req.body.email,
            password: password_hash
        });
        if (user == null)
            throw new Error("Ivalid user credentials");
        // set session
        req.session.user_id = user._id.toString().split('"')[0];
        req.session.is_admin = user.is_admin ?? false;
        res.send("Login Successful")

    } catch (error) {
        res.send({ error: "User login failed", message: error.message })
    }
})

app.get("/logout", async function (req, res) {
    try {
        req.session.destroy()
        res.send("Logout Successful")
    } catch (error) {
        res.send({ error: "User logout failed", message: e.message })
    }
})

app.post('/user', async function (req, res) {
    const is_admin = req.session.is_admin;
    if (is_admin)
        try {
            // Add admin check
            if (!req.body.name)
                throw new Error("Username cant be empty");
            if (!req.body.email)
                throw new Error("Email ID cant be empty");
            if (!req.body.password)
                throw new Error("Password cant be empty");
            const password_hash = crypto.createHmac('sha256', req.body.password).digest('hex');

            const client = new MongoClient(process.env.MAIN_CLUSTER);
            await client.connect();
            const users_collection = client.db("group-chat").collection("users");
            await users_collection.insertOne({
                name: req.body.name,
                email_id: req.body.email,
                password: password_hash,
                created_date: new Date().toISOString(),
                is_admin: req.body.is_admin ?? false
            })
            client.close();
            res.send("User created");
        } catch (e) {
            res.send({ error: "User creation failed", message: e.message })
        }
    else
        res.send("You are not admin babe")
});

app.put('/user', async function (req, res) {
    const is_admin = req.session.is_admin;
    if (is_admin)
        try {
            const obj = {};
            // Add Check is admin
            if (!req.body.id)
                throw new Error("User id cant be empty");
            if (req.body.email)
                obj.email_id = req.body.email;
            if (req.body.name)
                obj.name = req.body.name;
            const client = new MongoClient(process.env.MAIN_CLUSTER);
            await client.connect();
            const user_status = await client.db("group-chat").collection("users").updateOne({ _id: ObjectId(req.body.id) }, { $set: obj });
            if (!user_status)
                throw new Error("Cant update the given details");
            client.close();
            res.send(users_collection);
        } catch (e) {
            res.send({ error: "User update failed", message: e.message })
        }
    else
        res.send("You are not admin babe")
});

app.get('/group', async function (req, res) {
    let userId = req.session.user_id;
    if (userId) {
        const client = new MongoClient(process.env.MAIN_CLUSTER);
        try {
            await client.connect();
            const groups_collection = client.db("group-chat").collection("groups");
            const groups = await groups_collection.find({
                users: userId
            }).toArray();
            client.close();
            res.send(groups);
        } catch (e) {
            res.send({ error: "Group creation failed", message: e.message })
        }
    }
    else
        res.send("Please login first to create a group")
})

app.post('/group', async (req, res) => {
    let userId = req.session.user_id;
    if (userId) {
        try {
            if (!req.body.name)
                throw new Error("Please provide group name");
            const client = new MongoClient(process.env.MAIN_CLUSTER);
            await client.connect();
            const groups_collection = client.db("group-chat").collection("groups");
            await groups_collection.insertOne({
                name: req.body.name,
                users: [userId],
                created_date: new Date().toISOString()
            })
            client.close();
            res.send("Group created succesfully");
        } catch (e) {
            res.send({ error: "Group creation failed", message: e.message })
        }
    }
    else
        res.send("Please login first to create a group")
})

app.put('/group', async function (req, res) {
    let userId = req.session.user_id;
    if (userId) {
        try {
            if (!req.body.group_id)
                throw new Error("Please provide group id");
            if (!req.body.member_id)
                throw new Error("Please provide a member ID you want to add")
            const client = new MongoClient(process.env.MAIN_CLUSTER);
            await client.connect();
            const msg_status = await client.db("group-chat").collection("groups").updateOne({ _id: ObjectId(req.body.group_id) }, { $push: { users: req.body.member_id } });
            client.close();
            res.send(msg_status);
        } catch (e) {
            res.send({ error: "Group creation failed", message: e.message })
        }
    }
    else
        res.send("Please login first to create a group")
})

app.delete('/group', async (req, res) => {
    let userId = req.session.user_id;
    if (userId) {
        try {
            if (!req.body.group_id)
                throw new Error("Please provide group id");
            const client = new MongoClient(process.env.MAIN_CLUSTER);
            await client.connect();
            const groups_collection = await client.db("group-chat").collection("groups").deleteOne({ _id: ObjectId(req.body.group_id), users: userId });
            client.close();
            res.send({ status: groups_collection, message: "Group deleted succesfully" });
        } catch (e) {
            res.send({ error: "Group creation failed", message: e.message })
        }
    }
    else
        res.send("Please login first to delete a group buddy")
})

app.post('/message', async (req, res) => {
    let userId = req.session.user_id;
    if (userId) {
        try {
            if (!req.body.group_id)
                throw new Error("Please provide group id");
            if (!req.body.message)
                throw new Error("Message cant be empty")
            const client = new MongoClient(process.env.MAIN_CLUSTER);
            await client.connect();
            const msg_status = await client.db("group-chat").collection("groups").updateOne({ _id: new ObjectId(req.body.group_id), users: userId }, { $push: { chat: { id: Date.now(), user_id: userId, message: req.body.message } } });
            client.close();
            res.send(msg_status);
        } catch (e) {
            res.send({ error: "Posting Message failed", message: e.message })
        }
    }
    else
        res.send("Please login first to post a message")
})

app.post('/like', async (req, res) => {
    let userId = req.session.user_id;
    if (userId) {
        try {
            if (!req.body.group_id)
                throw new Error("Please provide group id");
            if (!req.body.message_id)
                throw new Error("Message cant be empty")
            const client = new MongoClient(process.env.MAIN_CLUSTER);
            await client.connect();
            let likes = [userId];
            const msg_status = await client.db("group-chat").collection("groups").updateMany({ _id: new ObjectId(req.body.group_id), users: userId, "chat.id": req.body.message_id },
                // [{
                //     $set: {
                //         likes: {
                //             $setUnion: "$likes"
                //         }
                //     }
                // }]       // Makes like array to act as Set
                {
                    $set: {
                        "chat.$.likes": [userId]
                    }
                }
            );
            client.close();
            res.send(msg_status);
        } catch (e) {
            res.send({ error: "Posting Message failed", message: e.message })
        }
    }
    else
        res.send("Please login first to post a message")
})


server = app.listen(3000);