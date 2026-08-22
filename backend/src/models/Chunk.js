import mongoose from "mongoose";

const chunkSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    chunkIndex: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Chunk", chunkSchema);
