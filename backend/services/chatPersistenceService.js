const pool = require("../db/pool");

function summarizeInteraction({ userMessage, assistantMessage, prediction, hadImage }) {
  const lines = [];

  if (userMessage) {
    lines.push(`- Patient reported: ${userMessage.trim()}`);
  } else if (hadImage) {
    lines.push("- Patient uploaded an image for clinical analysis.");
  }

  if (prediction?.specialty) {
    const specialty =
      prediction.specialty.charAt(0).toUpperCase() + prediction.specialty.slice(1);
    lines.push(
      `- Model run: ${specialty} -> ${prediction.predictedLabel || "Result available"}`,
    );
  }

  if (assistantMessage) {
    const compact = assistantMessage.replace(/\s+/g, " ").trim().slice(0, 600);
    lines.push(`- MedVise summary: ${compact}`);
  }

  return lines.join("\n");
}

async function persistChatInteraction({
  clerkUserId,
  userMessage,
  assistantMessage,
  prediction,
  hadImage = false,
}) {
  const summary = summarizeInteraction({
    userMessage,
    assistantMessage,
    prediction,
    hadImage,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `
        INSERT INTO chat_sessions (
          user_id,
          clerk_user_id,
          channel,
          specialty,
          status,
          summary,
          started_at,
          last_message_at
        )
        VALUES (NULL, $1, 'mobile-app', $2, 'completed', $3, NOW(), NOW())
        RETURNING id
      `,
      [clerkUserId || null, prediction?.specialty || null, summary || null],
    );

    const chatSessionId = sessionResult.rows[0]?.id;

    if (chatSessionId && (userMessage || hadImage)) {
      await client.query(
        `
          INSERT INTO chat_messages (
            chat_session_id,
            sender_role,
            content_redacted,
            created_at
          )
          VALUES ($1, 'user', $2, NOW())
        `,
        [chatSessionId, userMessage || "Image uploaded for model analysis."],
      );
    }

    if (chatSessionId && assistantMessage) {
      await client.query(
        `
          INSERT INTO chat_messages (
            chat_session_id,
            sender_role,
            content_redacted,
            created_at
          )
          VALUES ($1, 'assistant', $2, NOW())
        `,
        [chatSessionId, assistantMessage],
      );
    }

    if (prediction?.id && chatSessionId) {
      await client.query(
        `
          UPDATE prediction_events
          SET chat_session_id = $2
          WHERE id = $1
        `,
        [prediction.id, chatSessionId],
      );
    }

    await client.query("COMMIT");
    return { chatSessionId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  persistChatInteraction,
};
