const pool = require("../db/pool");

function isSchemaError(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

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
  chatSessionId,
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

    let activeChatSessionId = null;

    if (chatSessionId && clerkUserId) {
      const existingSession = await client.query(
        `
          SELECT id
          FROM chat_sessions
          WHERE id = $1
            AND clerk_user_id = $2
          LIMIT 1
        `,
        [chatSessionId, clerkUserId],
      );
      activeChatSessionId = existingSession.rows[0]?.id || null;
    }

    if (!activeChatSessionId) {
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
          VALUES (NULL, $1, 'mobile-app', $2, 'completed', NULL, NOW(), NOW())
          RETURNING id
        `,
        [clerkUserId || null, prediction?.specialty || null],
      );

      activeChatSessionId = sessionResult.rows[0]?.id || null;
    }

    if (activeChatSessionId && (userMessage || hadImage)) {
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
        [activeChatSessionId, userMessage || "Image uploaded for model analysis."],
      );
    }

    if (activeChatSessionId && assistantMessage) {
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
        [activeChatSessionId, assistantMessage],
      );
    }

    if (activeChatSessionId) {
      await client.query(
        `
          UPDATE chat_sessions
          SET
            specialty = COALESCE(specialty, $2),
            summary = LEFT(
              CASE
                WHEN summary IS NULL OR BTRIM(summary) = '' THEN $3
                WHEN $3 IS NULL OR BTRIM($3) = '' THEN summary
                ELSE summary || E'\n\n' || $3
              END,
              4000
            ),
            last_message_at = NOW()
          WHERE id = $1
        `,
        [activeChatSessionId, prediction?.specialty || null, summary || null],
      );
    }

    if (prediction?.id && activeChatSessionId) {
      await client.query(
        `
          UPDATE prediction_events
          SET chat_session_id = $2
          WHERE id = $1
        `,
        [prediction.id, activeChatSessionId],
      );
    }

    await client.query("COMMIT");
    return { chatSessionId: activeChatSessionId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listChatSessionsForUser(clerkUserId, limit = 50) {
  if (!clerkUserId) {
    const error = new Error("Authenticated Clerk user ID is required.");
    error.code = "UNSUPPORTED_AUTH";
    throw error;
  }

  try {
    const result = await pool.query(
      `
        SELECT
          cs.id,
          cs.specialty,
          cs.status,
          cs.summary,
          cs.started_at AS "startedAt",
          cs.last_message_at AS "lastMessageAt",
          COUNT(cm.id)::int AS "messageCount",
          (
            SELECT cm_first.content_redacted
            FROM chat_messages cm_first
            WHERE cm_first.chat_session_id = cs.id
              AND cm_first.sender_role = 'user'
              AND cm_first.content_redacted IS NOT NULL
              AND BTRIM(cm_first.content_redacted) <> ''
            ORDER BY cm_first.created_at ASC
            LIMIT 1
          ) AS "firstUserMessage"
        FROM chat_sessions cs
        LEFT JOIN chat_messages cm
          ON cm.chat_session_id = cs.id
        WHERE cs.clerk_user_id = $1
        GROUP BY cs.id
        ORDER BY cs.last_message_at DESC
        LIMIT $2
      `,
      [clerkUserId, Math.min(Math.max(Number(limit) || 50, 1), 100)],
    );

    return result.rows;
  } catch (error) {
    if (isSchemaError(error)) {
      error.originalMessage = error.message;
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function getChatSessionForUser({ clerkUserId, chatSessionId }) {
  if (!clerkUserId || !chatSessionId) {
    const error = new Error("Authenticated user and chat session ID are required.");
    error.code = "UNSUPPORTED_AUTH";
    throw error;
  }

  try {
    const sessionResult = await pool.query(
      `
        SELECT
          id,
          specialty,
          status,
          summary,
          started_at AS "startedAt",
          last_message_at AS "lastMessageAt"
        FROM chat_sessions
        WHERE id = $1
          AND clerk_user_id = $2
        LIMIT 1
      `,
      [chatSessionId, clerkUserId],
    );

    const session = sessionResult.rows[0];
    if (!session) {
      const error = new Error("Chat session not found.");
      error.code = "CHAT_SESSION_NOT_FOUND";
      throw error;
    }

    const messagesResult = await pool.query(
      `
        SELECT
          id,
          sender_role AS "senderRole",
          content_redacted AS "content",
          created_at AS "createdAt"
        FROM chat_messages
        WHERE chat_session_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [chatSessionId],
    );

    return {
      ...session,
      messages: messagesResult.rows,
    };
  } catch (error) {
    if (isSchemaError(error)) {
      error.originalMessage = error.message;
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

module.exports = {
  getChatSessionForUser,
  listChatSessionsForUser,
  persistChatInteraction,
};
