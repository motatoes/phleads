let fs = require('fs');
let path = require('path');
require('dotenv').config()
const converter = require('json-2-csv');
const { MongoClient } = require("mongodb");
const MongoStore = require('connect-mongo');
const { GraphQLClient, gql } = require('graphql-request')
const axios = require('axios');
const express = require('express');
const cookieParser = require("cookie-parser");
const sessions = require('express-session');
const bodyParser = require('body-parser');
var hbs = require('express-hbs');


const app = express()
const port = 3000

const client_id = process.env.PH_CLIENT_ID
const client_secret = process.env.PH_CLIENT_SECRET
const YOUR_DOMAIN = process.env.BACKEND_DOMAIN;
const redirect_uri = `${YOUR_DOMAIN}/callback`
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const stripe_product_id = process.env.STRIPE_PRODUCT_ID

mongo_url= process.env.MONGO_URL

// const url = "mongodb+srv://test:bYhDbgMjBlwfmFIK@cluster0.pl96xud.mongodb.net/?retryWrites=true&w=majority"
const client = new MongoClient(mongo_url);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function getUser(userId) {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Establish and verify connection
    const collection = "users"
    const db = client.db("phusers")
    const dbcol = db.collection(collection);
    query = {user_id: userId}
    const result = await dbcol.findOne(query);
    return result
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}


async function getPostData(postId) {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Establish and verify connection
    const collection = "posts"
    const db = client.db("phusers")
    const dbcol = db.collection(collection);
    query = {postId: postId}
    const result = await dbcol.findOne(query);
    return result
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function insertOrReplace(collection, query, payload) {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Establish and verify connection
    const db = client.db("phusers")
    const dbcol = db.collection(collection);
    const result = await dbcol.replaceOne(query, payload, {upsert:true});
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

function getVotersQuery(postId, cursor=null) {
    return gql`
    {
      post(id: "${postId}") {
        
        id,
        votes(after: "${cursor}") {
          pageInfo {
            startCursor
            endCursor
          }
          edges {
            node {
              id,
              user {
                id,
                username,
                twitterUsername,
                name
              }
            }
          }
        },
        votesCount
      }
    }`
}


function getPostsQuery(userId) {
    return gql`
    {
      user(id: ${userId}) {
        madePosts {
          edges{
            node {
              id
              name
              url
              description
              votesCount
              commentsCount
            }
          }
        }
      }
    }`
}

async function getAllVoters(token, postId, limit=null) {
    const graphQLClient = new GraphQLClient('https://api.producthunt.com./v2/api/graphql', {
        headers: {
          authorization: 'Bearer ' + token,
        },
    })

    let endCursor = null
    let query = null
    let totalVoters = []
    let totalCount = 0
    while(true) {
        query = getVotersQuery(postId, endCursor)
        let data = await graphQLClient.request(query)
        // console.log(data)
        // console.log(data.post.votes.pageInfo.endCursor)
        // console.log(data.post.votes.edges.length)
        totalCount = data.post.votesCount
        endCursor = data.post.votes.pageInfo.endCursor
        totalVoters = totalVoters.concat(data.post.votes.edges)

        if (limit) {
          let votersWithTwitter = totalVoters.filter(x => x.node.user.twitterUsername)
          if (votersWithTwitter.length >= limit) {
            return {totalCount: totalCount, voters: votersWithTwitter}
          }
        }

        if (endCursor === null) {
            break;
        }

        await delay(1000)        
    }

    // for (var i=0; i<totalVoters.length; i++) {
    //     console.log(totalVoters[i].node.user.twitterUsername)
    // }
    return {totalCount: totalCount, voters: totalVoters}

}

async function getUserdata(access_token) {
  const query = gql`query{viewer{user{id, username, twitterUsername}}}`
  const graphQLClient = new GraphQLClient('https://api.producthunt.com./v2/api/graphql', {
    headers: {
      authorization: `Bearer ${access_token}`,
    },
  })
  let data = await graphQLClient.request(query)
  return data.viewer.user
}

const oneDay = 1000 * 60 * 60 * 24;
app.use(sessions({
    secret: "thisism@£!£SADASysfhrgrfrty84fwir767",
    saveUninitialized:true,
    cookie: { maxAge: oneDay },
    resave: true,
    store: MongoStore.create({mongoUrl: mongo_url})
}));
app.use(cookieParser());
app.use(bodyParser.json());      
app.use(bodyParser.urlencoded({extended: true}));
//Sets handlebars configurations (we will go through them later on)
app.engine('hbs', hbs.express4({
  layoutsDir: __dirname + '/views/layouts'
}));
app.set('view engine', 'hbs');

app.get("/", async (req, res) => {
    phurl = `https://api.producthunt.com/v2/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=public+private`
    let session = req.session;
    console.log(session.user_id)
    if (session.user_id) {
        res.redirect("/posts")
    } else {
        // res.send(`<a href="${phurl}">auth with product hunt</a>`)    
        res.redirect(phurl)
    }    
})

// https://api.producthunt.com/v2/oauth/authorize?client_id=eqy1mVQmD1JtemeCaxZXyDbcuJzmUtBOqRR1bM5Nw18&redirect_uri=https://6cd5-82-163-196-26.ngrok.io/callback&response_type=code&scope=public+private
app.get('/callback', async (req, res) => {
  
  let code = req.query.code
  let url = `https://api.producthunt.com./v2/oauth/token?client_id=${client_id}&client_secret=${client_secret}&grant_type=authorization_code&code=${code}&redirect_uri=${redirect_uri}`
  let response = await axios.post(url)
  const token = response.data.access_token
  userData = await getUserdata(response.data.access_token)
  payload = {
    "user_id": userData.id,
    "twitter": userData.twitterUsername,
    "username": userData.username,
    "access_token": token,
    "token_type": response.data.token_type,
    "scope": response.data.scope,
    "created_at": response.data.created_at
  }
  const query = { user_id: { "$regex": payload.user_id } };
  await insertOrReplace("users", query, payload)

  let session = req.session;
  session.user_id = userData.id
  session.username = userData.username
  session.access_token = userData.access_token
  res.redirect("/posts")
  // res.send(`Successfully authorized! now search for your first post <form method="get" action="/tweeps"><input name="post"><input type="hidden" name="token" value="${token}"><button type="submit">load</button></form>`)
})

app.get("/logout", async (req, res) => {
    req.session.destroy();
    res.redirect('/');
})

app.get("/posts", async (req, res) => {
    let session = req.session
    let userId = session.user_id
    let user = await getUser(userId)
    let token = user.access_token

    const graphQLClient = new GraphQLClient('https://api.producthunt.com./v2/api/graphql', {
        headers: {
          authorization: `Bearer ${token}`,
        },
    })
    let query = getPostsQuery(userId)
    let data = await graphQLClient.request(query)
    let nodes = data.user.madePosts.edges
    res.render('posts', {posts: nodes, user:user, pageIsPosts: true, layout: 'index'})

})

app.get("/tweeps", async (req, res) => {
    let session = req.session
    let userId = session.user_id
    let user = await getUser(userId)
    let token = user.access_token
    let post = req.query.post
    let isCustom = req.query.c
    if (isCustom && !user.is_paid_customer) {
      res.redirect("/paywall")
      return
    }
    let {totalCount, voters} = await getAllVoters(token, post, limit=20)
    let toStore = {
        expiry: null,
        postId: post,
        data: voters
    }
    let query = {postId: {"$regex": post}}
    insertOrReplace("posts", query, toStore)
    let votersWithTwitterTop20 = voters.slice(0,20)

    // let votersWithTwitterCount = 0
    // let totalVotersCount = voters.length
    // for (var i=0; i<voters.length; i++) {
    //     let cuser = voters[i].node.user
    //     if (cuser.twitterUsername) {
    //         votersWithTwitterCount++
    //     }
    // }
    votersWithTwitterCount = Math.floor(totalCount/2)

    res.render("tweeps", {
      totalVotersCount: totalCount,
      votersWithTwitterCount:votersWithTwitterCount,
      voters: votersWithTwitterTop20, 
      post: post,
      layout: 'index'
    })
})

app.get("/export.csv", async (req, res) => {
    let session = req.session
    let userId = session.user_id
    let user = await getUser(userId)
    if (!user.is_paid_customer) {
      res.redirect("/paywall")
      return
    }
    let token = user.access_token
    let post = req.query.post
    let csvPayload = []
    let {totalCount, voters} = await getAllVoters(token, post, limit=null)
    for (var i=0; i<voters.length; i++) {
      csvPayload.push({
        "name": voters[i].node.user.name,
        "twitter": voters[i].node.user.twitterUsername,
        "PH username": voters[i].node.user.username
      })
    }
    converter.json2csv(csvPayload, function (err, csv) {

      let filename = `export_${post}.csv`;
      let absPath = path.join(__dirname, '/tmp/', filename);
      let relPath = path.join('./tmp', filename); // path relative to server root


      fs.writeFile(relPath, csv, (err) => {
        if (err) {
          console.log(err);
        }
        res.download(absPath, (err) => {
          if (err) {
            res.status(500).send('error');
            console.log(err);
          }
          fs.unlink(relPath, (err) => {
            if (err) {
              console.log(err);
            }
            console.log('FILE [' + filename + '] REMOVED!');
          });
        });
      });
    })
    
})

app.get("/paywall", async (req, res) => {
  res.render("paywall.hbs", {
    layout: "index"
  })
})

app.post('/create-checkout-session', async (req, res) => {
  let session = req.session
  let userId = session.user_id

  const stripeSession = await stripe.checkout.sessions.create({
    line_items: [
      {
        // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
        price: stripe_product_id,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: `${YOUR_DOMAIN}/purchase-success?userId=${userId}`,
    cancel_url: `${YOUR_DOMAIN}/purchase-cancel?userId=${userId}`,
  });

  res.redirect(303, stripeSession.url);
});

app.get('/purchase-success', async (req, res) => {
  let userId = req.query.userId
  let user = await getUser(userId)

  // update purchase status for user here
  user.is_paid_customer = true
  const query = { user_id: { "$regex": userId } };
  await insertOrReplace("users", query, user)

  res.render("purchase-success", {
    layout: 'index',
    user: user
  })
})

app.get('/purchase-cancel', async (req, res) => {
  res.render("purchase-cancel", {
    layout: 'index'
  })
})


// == app settings ==
app.use(express.static('public'))

// == start the app ==
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
