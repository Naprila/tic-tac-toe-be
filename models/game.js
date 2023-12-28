import mongoose from "mongoose";

const gameSchema = new mongoose.Schema({
  gameId: String,
  myturn: String,
  live: Boolean,
});

const Game = mongoose.models.Game || mongoose.model("Game", gameSchema);
export default Game;
