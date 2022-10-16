import { GraphQLClient, gql } from 'graphql-request'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function loadAllUsers() {

    function getQuery(postId, cursor=null) {
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
    

    const graphQLClient = new GraphQLClient('https://api.producthunt.com./v2/api/graphql', {
        headers: {
          authorization: 'Bearer TdNsjk2gDxE5wTSi3D8b58tyNXzbThIfaLq5x0J2dkI',
        },
    })

    let endCursor = null
    let query = null
    let totalUsers = []
    while(true) {
        query = getQuery("insightup", endCursor)
        let data = await graphQLClient.request(query)
        console.log(data)
        console.log(data.post.votes.pageInfo.endCursor)
        console.log(data.post.votes.edges.length)
        endCursor = data.post.votes.pageInfo.endCursor
        totalUsers = totalUsers.concat(data.post.votes.edges)
        console.log(totalUsers)
        await delay(1000)
        if (endCursor === null) {
            break;
        }   
        break;
    }

    console.log(totalUsers)
    for (var i=0; i<totalUsers.length; i++) {
        console.log(totalUsers[i].node.user.twitterUsername)
    }
    return totalUsers

}


loadAllUsers()