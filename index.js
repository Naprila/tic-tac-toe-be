import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import User from "./models/user.js";
import Game from "./models/game.js";
import cors from "cors";
import {
  sendRequestScheam,
  sendRequestSchema,
  signInSchema,
  signUpSchema,
} from "./validation/type.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

const users = {};

wss.on("connection", (ws, req) => {
  const id = uuidv4();

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    console.log(data);
    if (data.type === "join") {
      users[id] = {
        room: data.payload.roomId,
        ws,
      };
    }

    if (data.type === "put" || data.type === "finished") {
      // console.log(users[id].room);
      const roomId = users[id].room;
      const xy = data.payload;
      Object.keys(users).forEach((user_id) => {
        if (users[user_id].room === roomId) {
          if (data.type === "finished") {
            const winner = data.payload;
            users[user_id].ws.send(
              JSON.stringify({
                type: "finished",
                payload: {
                  winner,
                },
              })
            );
          } else {
            users[user_id].ws.send(
              JSON.stringify({
                type: "put",
                payload: {
                  xy,
                },
              })
            );
          }
        }
      });
    }
  });
});

app.get("/health", (req, res) => {
  res.json({ msg: "I am healthy" });
});

mongoose
  .connect("mongodb://localhost:27017/tictac")
  .then((e) => {
    console.log("DB connected successfully");
  })
  .catch((e) => {
    console.log("error: ", e);
  });

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const email = authHeader.split(" ")[1];
    const res = await User.findOne({ email });

    if (res) {
      next();
    } else {
      res.status(401).json({ msg: "Not Authorised!" });
    }
  } else {
    res.status(401).json({ msg: "Not Authorised!" });
  }
};

app.post("/signup", async (req, res) => {
  const email = req.body.email;

  const response = signUpSchema.safeParse(req.body);
  console.log(response);
  if (!(response.success === true)) {
    res.status(401).json({
      err: response,
    });
    return;
  }

  const found = await User.findOne({ email });
  if (found) {
    res.status(401).json({ err: "Email already register" });
  } else {
    const { username, password, email } = req.body;
    console.log(req.body);
    const nuser = await User.create({ username, password, email });
    console.log(nuser);
    res.status(200).json({ msg: "User created successfully!", email });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const response = signInSchema.safeParse(req.body);

  if (!(response.success === true)) {
    res.status(401).json({
      err: response,
    });
    return;
  }
  const found = await User.findOne({ email, password });
  if (found) {
    res.status(200).json({ email });
  } else {
    res.status(401).send("Invalid username or password!");
  }
});

app.put("/send_request", authenticateUser, async (req, res) => {
  const response = sendRequestSchema.safeParse(req.body);
  if (!(response.success === true)) {
    res.status(401).json({
      err: response,
    });
    return;
  }

  // player2 email
  const { sender_email, oppEmail } = req.body;

  try {
    const found = await User.findOne({ email: oppEmail });
    if (found) {
      await User.updateOne(
        { email: oppEmail },
        { $push: { request: { sender: sender_email } } }
      );
      res.status(200).json({ msg: "Updated successfully" });
    } else {
      res.status(400).json({ err: "User doesn't exist" });
    }
  } catch (error) {
    res.status(400).json({ err: "Could not update" });
  }
});

app.post("/update_status/:email", async (req, res) => {
  try {
    const value = req.body.status;
    await User.findOneAndUpdate(
      { email: req.params.email },
      { $set: { status: value } }
    );
    console.log("USER SATUS:", value);
    res.status(200).json({ msg: "Status updated" });
  } catch (error) {
    res.status(400).json({ err: "Error updating the status" });
  }
});

app.get("/me/:email_id", async (req, res) => {
  const user = await User.findOne({ email: req.params.email_id });
  res.status(200).json({ user });
});

// create an endpoint for deleting the request when user clicks on Accept button
app.post("/delete_request/:sender/:receiver", async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { email: req.params.sender },
      { $pull: { request: { sender: req.params.receiver } } }
    );
    const gameId = uuidv4();
    try {
      const startUpdated = await User.findOneAndUpdate(
        { email: req.params.receiver },
        { $set: { start: gameId } }
      );
      res
        .status(200)
        .json({ msg: "Request deleted and GameId generated", gameId });
      return;
    } catch (error) {
      res.status(200).json({
        msg: "Deleted the request successfully! ERROR: in generating GameID ",
      });
    }
  } catch (error) {
    res.status(400).json({ err: "Error in deleting the request" });
  }
});

// update the start(which is an indicator for player2 that game has started) after match finished
app.put("/game/updatestart/:email", async (req, res) => {
  try {
    await User.findOneAndUpdate(
      { email: req.params.email },
      { $set: { start: null } }
    );
    res.status(200).json({ msg: "Updated start successfully" });
  } catch (error) {
    res.status(400).json({ msg: "Updating start", error });
  }
});

// assign the first turn to whoever accept the req
app.post("/game/assignturn/:gameId/:email", async (req, res) => {
  try {
    await Game.create({ gameId: req.params.gameId, myturn: req.params.email });
    res.status(200).json({ msg: "GameID created and First Turn assigned" });
  } catch (error) {
    res
      .status(400)
      .json({ err: "Error in assigning turn, GameID not created" });
  }
});

// return whose turn is it
app.get("/game/:gameId", async (req, res) => {
  try {
    // console.log(req.params.gameId);
    const game = await Game.findOne({ gameId: req.params.gameId });
    // console.log(game.myturn, game.gameId);
    res.status(200).json({ game });
  } catch (error) {
    res.status(400).json({ msg: "Error getting email(turn)" });
  }
});

app.post("/game/toggleturn/:gameId/:email", async (req, res) => {
  try {
    const updated = await Game.findOneAndUpdate(
      { gameId: req.params.gameId },
      { $set: { myturn: req.params.email } }
    );
    // console.log(updated);
    res.status(200).json({ msg: "Turn updated", turn: updated.myturn });
  } catch (error) {
    res.status(400).json({ err: "Error updating the turn" });
  }
});

// update game as live
app.post("/game/updatelive/:gameId", async (req, res) => {
  try {
    const value = req.body.toUpdate;
    await Game.findOneAndUpdate(
      { gameId: req.params.gameId },
      { $set: { live: value } }
    );
    res.status(200).json({ msg: "GAME LIVE updated" });
  } catch (error) {
    res.status(400).json({ err: "Error updating the game as live" });
  }
});

// deleting the gameId after leaving room
app.post("/game/deletegame/:gameId", async (req, res) => {
  try {
    const value = req.body.toUpdate;
    await Game.findOneAndDelete({ gameId: req.params.gameId });
    res.status(200).json({ msg: "GAME object deleted from DB" });
  } catch (error) {
    res.status(400).json({ err: "Error deleting the game " });
  }
});

// global catches
app.use((err, req, res, next) => {
  // keep count of the error so we can monitor them
  console.log(err);
  res.status(500).json({ err: "Sorry something is up with our server" });
});

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

server.listen(3000, () => console.log("Server is up"));
