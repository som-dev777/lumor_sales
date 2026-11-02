# Emails to the person who booked (F22)

The owner's wording (2026-11-03), used word for word by the app. `{…}` are filled in by the
app. Lines in _italics_ explain how the app adapts a line; they are not part of the email.

- "Lumor demo" is the event's **name in emails** (set on the event).
- "Somnath Chakraborty, Co-founder, Lumor" is the host's name and their **title in emails**
  (set on Calendar → Availability).
- The "To get the most…" paragraph is the event's **note in emails**. It's left out when empty.

## Confirmation (sent at once)

Subject: You’re booked: Lumor demo on {event date} at {event time}

Hi {invitee first name},

Thanks for booking a demo of Lumor. Here are the details:

_(The app writes "Thanks for booking a {name in emails}." ("a Lumor demo") so it fits any event.)_

When: {event date}, {event time} ({invitee timezone}), {duration} minutes
Where: Google Meet: {meeting link}
With: Somnath Chakraborty, Co-founder, Lumor

_(For an in-person meeting, "Where" is the address. Without a Meet link, it's the event's
location.)_

To get the most from the 30 minutes, have a study you’re working on to hand. We’ll show you Lumor on something like it.

[ Reschedule or cancel ] → {reschedule/cancel link}

See you then,

Somnath
Lumor

## 24 hours before

Subject: Tomorrow: your Lumor demo at {event time}

Hi {invitee first name}, a quick reminder that we’re meeting tomorrow at {event time} on Google Meet: {meeting link}. If the time no longer works, you can pick another slot.

[ Choose a new time ]

_(Sent only when the meeting was booked more than a day ahead.)_

## 1 hour before

Subject: Starting in an hour: Lumor demo

Hi {invitee first name}, see you at {event time}: {meeting link}.

[ Choose a new time ] (if something’s come up)

_(Sent only when the meeting was booked more than 2 hours ahead.)_
