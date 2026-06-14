const admin = require('firebase-admin');

module.exports = async (req, res) => {
  // Allow manual requests in development, but enforce Vercel Cron headers in production
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['x-vercel-cron'] === 'true' || process.env.NODE_ENV !== 'production';
  if (!isCron) {
    return res.status(401).json({ error: "Unauthorized. This endpoint is only callable by Vercel Cron." });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || 'hubspace-sync';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    return res.status(400).json({
      error: "Firebase Admin credentials missing. Please set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Vercel environment variables."
    });
  }

  // Handle double-escaped newlines in Vercel environment variables
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
    }

    const db = admin.firestore();
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      return res.status(200).json({ message: "No users found in Firestore." });
    }

    const now = Date.now();
    const notificationsSent = [];

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;
      const fcmToken = userData.fcmToken;
      const todos = userData.todos || [];

      if (!fcmToken) {
        // Skip users with no push token registered
        continue;
      }

      // Filter tasks by priority and completion status
      const highPending = todos.filter(t => !t.completed && t.priority === 'high');
      const mediumPending = todos.filter(t => !t.completed && t.priority === 'medium');
      const lowPending = todos.filter(t => !t.completed && t.priority === 'low');

      // Check timers based on criteria
      // High: every 2 minutes (every cron run)
      const shouldSendHigh = highPending.length > 0;
      
      // Medium: every 7 minutes
      const lastMedium = userData.lastMediumReminder || 0;
      const shouldSendMedium = mediumPending.length > 0 && (now - lastMedium >= 7 * 60 * 1000);

      // Low: every 15 minutes
      const lastLow = userData.lastLowReminder || 0;
      const shouldSendLow = lowPending.length > 0 && (now - lastLow >= 15 * 60 * 1000);

      const updates = {};
      const messagesToSend = [];

      if (shouldSendHigh) {
        const count = highPending.length;
        const taskNames = highPending.slice(0, 3).map(t => t.name).join(', ');
        const extra = count > 3 ? ` and ${count - 3} more` : '';
        messagesToSend.push({
          title: "🚨 High Priority Tasks Reminder",
          body: `You have ${count} pending high-priority task(s): ${taskNames}${extra}. Please review!`
        });
        updates.lastHighReminder = now;
      }

      if (shouldSendMedium) {
        const count = mediumPending.length;
        const taskNames = mediumPending.slice(0, 3).map(t => t.name).join(', ');
        const extra = count > 3 ? ` and ${count - 3} more` : '';
        messagesToSend.push({
          title: "⚠️ Medium Priority Tasks Reminder",
          body: `You have ${count} pending medium-priority task(s): ${taskNames}${extra}.`
        });
        updates.lastMediumReminder = now;
      }

      if (shouldSendLow) {
        const count = lowPending.length;
        const taskNames = lowPending.slice(0, 3).map(t => t.name).join(', ');
        const extra = count > 3 ? ` and ${count - 3} more` : '';
        messagesToSend.push({
          title: "ℹ️ Low Priority Tasks Reminder",
          body: `You have ${count} pending low-priority task(s): ${taskNames}${extra}.`
        });
        updates.lastLowReminder = now;
      }

      // Send the messages
      for (const msg of messagesToSend) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: msg.title,
              body: msg.body
            },
            webpush: {
              notification: {
                title: msg.title,
                body: msg.body,
                icon: '/logo.png',
                badge: '/logo.png',
                tag: msg.title.replace(/\s+/g, '-').toLowerCase() // group/overwrite similar notifications
              }
            }
          });
          notificationsSent.push({ userId, title: msg.title });
        } catch (sendErr) {
          console.error(`Error sending message to user ${userId}:`, sendErr);
          // If the token is invalid or inactive, we could optionally clean it up
          if (sendErr.code === 'messaging/registration-token-not-registered') {
            updates.fcmToken = admin.firestore.FieldValue.delete();
          }
        }
      }

      // Save updated reminder timestamps to database
      if (Object.keys(updates).length > 0) {
        await doc.ref.update(updates);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Checked tasks and sent ${notificationsSent.length} notification(s).`,
      details: notificationsSent
    });

  } catch (err) {
    console.error("Cron function runtime error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};
