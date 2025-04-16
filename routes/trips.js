const express = require("express");
const db = require("../config/firebase");
const axios = require("axios");
const router = express.Router();

const tripsRef = db.collection("trips");

// CREATE TRIP
router.post("/", async (req, res) => {
  const user = req.user; // Authenticated user
  const { title, summary, createdAt, tags } = req.body;

  console.log("User:", user); // Log the authenticated user
  console.log("Request body:", req.body); // Log the request body

  if (!title) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const newTripRef = tripsRef.doc();
    const newTrip = {
      id: newTripRef.id,
      title,
      summary,
      createdBy: user.id, // Use authenticated user's ID
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

// INVITE MEMBER BY EMAIL
router.post("/:tripId/invite", async (req, res) => {
  const { email } = req.body; // invited user
  const { tripId } = req.params;
  if (!email) {
    return res.status(400).json({ error: "Missing invited user info" });
  }

  try {
    const response = await axios.post(
      `${process.env.USER_SERVICE_URL}/users/email`,
      {
        email,
      }
    );

    if (response.status !== 200) {
      return res.status(response.status).json({ error: response.data.error });
    }

    const invitedUser = response.data;
    const userId = invitedUser.id;

    const tripDoc = await tripsRef.doc(tripId).get();
    if (!tripDoc.exists) {
      return res.status(404).json({ error: "Trip not found" });
    }
    const trip = tripDoc.data();

    const isAlreadyMember = trip.members.some((m) => m.userId === userId);
    if (isAlreadyMember) {
      return res.status(400).json({ error: "User already a member" });
    }

    trip.members.push({
      userId,
      email: invitedUser.email,
      firstName: invitedUser.firstName,
      lastName: invitedUser.lastName,
    });
    trip.memberIds.push(userId);
    await tripsRef.doc(tripId).update({ members: trip.members });

    res.status(200).json({ message: "User invited successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to invite user", details: err.message });
  }
});

// CREATE EVENT
router.post("/:tripId/events", async (req, res) => {
  const user = req.user; // Authenticated user
  const { name, date, createdAt } = req.body;
  const { tripId } = req.params;

  if (!name || !date) {
    return res.status(400).json({ error: "Missing event info" });
  }

  try {
    const eventRef = db.collection(`trips/${tripId}/events`).doc();
    const event = {
      id: eventRef.id,
      name,
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
    const eventsSnapshot = await eventsRef.get();

    if (eventsSnapshot.empty) {
      return res.status(404).json({ error: "No events found for this trip" });
    }

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

// GET ALL TRIPS FOR A USER
router.get("/user", async (req, res) => {
  const user = req.user; // Authenticated user

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

module.exports = router;
