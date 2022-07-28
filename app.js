const express = require('express');
const http = require('http');
const socketio = require('socket.io')
const { ExpressPeerServer } = require("peer");
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDB = require("./config/db");


const app = express();

const server = http.createServer(app);
const io = socketio(server).sockets;

//Border Parser
app.use(express.json());

const customGenerationFunction = () => 
(Math.random.toString(36) + "00000000000000000000").substring(2,16);

const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: "/",
  generateClientId: customGenerationFunction
});

app.use("/mypeer", peerServer);

//Connect to mongodb
connectDB();
const Active = require('./schema/active_user');

app.get('/test', function(req, res) {
res.json({msz : 'Whats Up!'});
})

//Webscokets
io.on("connection", function(socket) {
  socket.on('join-general-room', ({roomID}) => {
    socket.join(roomID);
  });

  socket.on('user-exists', ({user, socketID}) => {
    //Check if the new user exists in active chat
    Active.findOne({
      email: user.email
    }).then((user) => {
      //Emit found to last connected user
      io.in(socketID).emit("user-found", user);
    });

    //Update user if found
    socket.on("update-user", ({user,socketID, allUserRoomID}) => {
      socket.join(allUserRoomID);

      //Find user and update socketID
      Active.findOneAndUpdate(
        {
          email: user.email
        },
        {
          $set: {socketID}
        },
        {
          new: true
        },
        (err, doc) => {
          if(doc) {
            //Send Active Users to the last connected user
            Active.find({}).then(allUsers => {
              const otherUsers = allUsers.filter(
                ({email: otherEmails}) => otherEmails !== user.email);

                io.in(socketID).emit('activeUsers', otherUsers);
            });
          }
        }
      );

      // Notify other users about update or joined user
      socket.to(allUserRoomID).broadcast.emit("new-user-join", [{...user, socketID}]); 

      socket.on("user-join", ({allUserRoomID, user, socketID})=>{
        socket.join(allUserRoomID);

        //Store new user in active chats
        const active = new Active({...user, socketID});

        //Find the document || add the document
        Active.findOne(
          {
          email: user.email
        }).then(user => {
          if(!user) {
            active.save().then(({email}) => {
              Active.find({}).then(users => {
                const otherUsers = users.filter(({
                  email: otherEmails
                }) => otherEmails !== email);

                //Send others to new connected user
                io.in(socketID).emit("activeUsers", otherUsers);
              })
            })
          } else {
            //Emit to all other users the last joined user
            socket.to(allUserRoomID).broadcast.emit("new-user-join" ,user);
          }
        })
      })
    })
  }); 
});

const port = process.env.PORT || 5000;
server.listen(port, () => console.log('Server is running on ' + port));