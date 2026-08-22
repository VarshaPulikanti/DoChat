import mongoose from "mongoose";

const chatHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    sources: [
      {
        documentName: String,
        text: String,
        score: Number,
      },
    ],
  },
  { timestamps: true }
);

chatHistorySchema.index({ userId: 1, documentId: 1, createdAt: -1 });

export default mongoose.model("ChatHistory", chatHistorySchema);
