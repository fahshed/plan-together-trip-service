/* eslint-disable max-lines */
const express = require("express");
const db = require("../config/firebase");
const axios = require("axios");
const router = express.Router();

const tripsRef = db.collection("trips");

// CREATE TRIP
router.post("/", async (req, res) => {
  const user = req.user;
  const { title, summary, createdAt, tags } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const newTripRef = tripsRef.doc();
    const newTrip = {
      id: newTripRef.id,
      title,
      summary,
      createdBy: user.id,
      createdAt,
      owner: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      members: [],
      memberIds: [],
      tags: tags || [],
    };

    await newTripRef.set(newTrip);

    res.status(201).json({ tripId: newTripRef.id, ...newTrip });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to create trip", details: err.message });
  }
});

// GET ALL TRIPS FOR A USER
router.get("/user", async (req, res) => {
  const user = req.user;

  try {
    const tripsSnapshot = await tripsRef
      .where("memberIds", "array-contains", user.id)
      .get();

    const ownerTripsSnapshot = await tripsRef
      .where("owner.userId", "==", user.id)
      .get();

    const tripsSnapshotDocs = tripsSnapshot.docs;
    const ownerTripsSnapshotDocs = ownerTripsSnapshot.docs;

    const combinedTrips = [...tripsSnapshotDocs, ...ownerTripsSnapshotDocs];
    const uniqueTrips = Array.from(
      new Map(combinedTrips.map((doc) => [doc.id, doc])).values()
    );

    const trips = uniqueTrips.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(trips);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to retrieve trips", details: err.message });
  }
});

// GET TRIP BY ID
router.get("/:tripId", async (req, res) => {
  const user = req.user;
  const { tripId } = req.params;

  try {
    const tripDoc = await tripsRef.doc(tripId).get();
    if (!tripDoc.exists) {
      return res.status(404).json({ error: "Trip not found" });
    }
    const trip = tripDoc.data();

    if (trip.owner.userId !== user.id && !trip.memberIds.includes(user.id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.status(200).json({ id: tripDoc.id, ...trip });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to retrieve trip", details: err.message });
  }
});

// GET MEMBERS AND OWNER OF A TRIP
router.get("/:tripId/members", async (req, res) => {
  const user = req.user;
  const { tripId } = req.params;

  try {
    const tripDoc = await tripsRef.doc(tripId).get();
    if (!tripDoc.exists) {
      return res.status(404).json({ error: "Trip not found" });
    }
    const trip = tripDoc.data();

    if (trip.owner.userId !== user.id && !trip.memberIds.includes(user.id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const membersAndOwner = [trip.owner, ...trip.members];

    res.status(200).json(membersAndOwner);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to retrieve members", details: err.message });
  }
});
// eslint-disable-next-line complexity
router.post("/:tripId/invite", async (req, res) => {
  const user = req.user;
  const { email } = req.body;
  const { tripId } = req.params;
  if (!email) {
    return res.status(400).json({ error: "Missing invited user info" });
  }

  try {
    const tripDoc = await tripsRef.doc(tripId).get();
    if (!tripDoc.exists) {
      return res.status(404).json({ error: "Trip not found" });
    }
    const trip = tripDoc.data();

    if (trip.owner.userId !== user.id) {
      return res.status(403).json({ error: "Only owner can invite users" });
    }

    let invitedUser;
    try {
      const response = await axios.post(
        `${process.env.AUTH_SERVICE_URL}/auth/email`,
        {
          email,
        }
      );
      invitedUser = response.data;
    } catch (error) {
      return res
        .status(400)
        .json({ error: error.response?.data?.error || error.message });
    }

    const userId = invitedUser.id;

    const isAlreadyMember = trip.members.some((m) => m.userId === userId);
    if (trip.owner.userId === userId) {
      return res.status(400).json({ error: "Cannot invite the owner" });
    }
    if (isAlreadyMember) {
      return res.status(400).json({ error: "User already a member" });
    }

    const newMember = {
      userId,
      email: invitedUser.email,
      firstName: invitedUser.firstName,
      lastName: invitedUser.lastName,
    };
    trip.members.push(newMember);
    trip.memberIds.push(userId);
    await tripsRef
      .doc(tripId)
      .update({ members: trip.members, memberIds: trip.memberIds });

    res
      .status(200)
      .json({ message: "User invited successfully", member: newMember });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to invite user", details: err.message });
  }
});

// CREATE EVENT
router.post("/:tripId/events", async (req, res) => {
  const user = req.user;
  const { name, date, description, createdAt } = req.body;
  const { tripId } = req.params;

  if (!name || !date) {
    return res.status(400).json({ error: "Missing event info" });
  }

  try {
    const tripDoc = await tripsRef.doc(tripId).get();
    if (!tripDoc.exists) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const eventRef = db.collection(`trips/${tripId}/events`).doc();
    const event = {
      id: eventRef.id,
      name,
      description,
      date,
      createdAt,
      createdBy: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
    await eventRef.set(event);

    res.status(201).json({ eventId: eventRef.id, ...event });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to create event", details: err.message });
  }
});

// GET LIST OF EVENTS FOR A TRIP
router.get("/:tripId/events", async (req, res) => {
  const { tripId } = req.params;

  try {
    const eventsRef = db.collection(`trips/${tripId}/events`);
    const eventsSnapshot = await eventsRef.orderBy("date", "asc").get();

    const events = eventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(events);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to retrieve events", details: err.message });
  }
});

// GET EVENT BY ID
router.get("/:tripId/events/:eventId", async (req, res) => {
  const { tripId, eventId } = req.params;

  try {
    const eventRef = db.collection(`trips/${tripId}/events`).doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = { id: eventDoc.id, ...eventDoc.data() };

    res.status(200).json(event);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to retrieve event", details: err.message });
  }
});

// CREATE TASK UNDER AN EVENT
router.post("/:tripId/events/:eventId/tasks", async (req, res) => {
  const user = req.user;
  const { name, description, createdAt, assignedTo, priority } = req.body;
  const { tripId, eventId } = req.params;

  if (!name || !assignedTo || !assignedTo.userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const eventRef = db.collection(`trips/${tripId}/events`).doc(eventId);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const taskRef = db
      .collection(`trips/${tripId}/events/${eventId}/tasks`)
      .doc();
    const task = {
      id: taskRef.id,
      name,
      description,
      createdAt,
      priority,
      status: "pending",
      assignedTo: {
        userId: assignedTo.userId,
        email: assignedTo.email,
        firstName: assignedTo.firstName,
        lastName: assignedTo.lastName,
      },
      createdBy: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };

    await taskRef.set(task);

    res.status(201).json({ taskId: taskRef.id, ...task });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to create task", details: err.message });
  }
});

// GET LIST OF TASKS GROUPED BY USER
router.get("/:tripId/events/:eventId/tasks/grouped", async (req, res) => {
  const { tripId, eventId } = req.params;

  try {
    const tasksRef = db.collection(`trips/${tripId}/events/${eventId}/tasks`);
    const tasksSnapshot = await tasksRef.get();

    const groupedTasks = {};

    tasksSnapshot.docs.forEach((doc) => {
      const task = doc.data();
      const userId = task.assignedTo.userId;

      if (!groupedTasks[userId]) {
        groupedTasks[userId] = { pending: [], completed: [] };
      }

      if (task.status === "completed") {
        groupedTasks[userId].completed.push({ id: doc.id, ...task });
      } else {
        groupedTasks[userId].pending.push({ id: doc.id, ...task });
      }
    });

    Object.keys(groupedTasks).forEach((userId) => {
      groupedTasks[userId] = [
        ...groupedTasks[userId].pending.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        ),
        ...groupedTasks[userId].completed.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        ),
      ];
    });

    res.status(200).json(groupedTasks);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to retrieve tasks", details: err.message });
  }
});

// UPDATE TASK STATUS TO COMPLETE
router.patch(
  "/:tripId/events/:eventId/tasks/:taskId/status",
  async (req, res) => {
    const { tripId, eventId, taskId } = req.params;
    const { taskStatus } = req.body;

    try {
      const taskRef = db
        .collection(`trips/${tripId}/events/${eventId}/tasks`)
        .doc(taskId);
      const taskDoc = await taskRef.get();

      if (!taskDoc.exists) {
        return res.status(404).json({ error: "Task not found" });
      }

      await taskRef.update({ status: taskStatus });

      res.status(200).json({ message: "Task status updated to complete" });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Failed to update task status", details: err.message });
    }
  }
);

module.exports = router;
