# Content Questionnaire

Answer these whenever you have time — there's no need to do it all at once.
Each answer maps directly to a field in `config/content.json`. You can edit
that file yourself, or send me your answers and I'll fill it in.

## 1. The basics

- [ ] Wedding date and time of day?
- [ ] RSVP-by deadline?
- [ ] A hero photo of the two of you for the homepage background?
- [ ] A 1-2 sentence welcome message for guests landing on the site?
- [ ] A wedding hashtag, if you want one?

## 2. Our Story

- [ ] How did you two meet? (date/place + a few sentences)
- [ ] Any other key milestones you want a timeline entry for — first trip,
      moving in together, the proposal, getting engaged? For each: a date,
      a short title, a few sentences, and (optionally) a photo.

## 3. Wedding Party

For each person in the wedding party (bridesmaids, groomsmen, maid/matron of
honor, best man, flower girl, ring bearer, etc.):
- [ ] Name
- [ ] Role (e.g. "Maid of Honor")
- [ ] Which side (Annami's or Robin's)
- [ ] A short bio — how they know the couple, a fun fact
- [ ] A photo

## 4. Ceremony & Reception

- [ ] Ceremony venue name, full address, and a Google Maps link
- [ ] Ceremony time and any notes (arrival time, duration, indoor/outdoor)
- [ ] Reception venue name, full address, and a Google Maps link (if
      different from ceremony)
- [ ] Reception time and any notes (cocktail hour, dinner, dancing timing)
- [ ] Anything else guests should know about the day's schedule (e.g.
      additional events like a welcome drinks the night before, or brunch
      the day after)?

## 5. Attire

- [ ] Dress code (e.g. "Black Tie Optional", "Garden Formal", "Cocktail")
- [ ] Any specifics — colors to avoid, indoor/outdoor/grass considerations,
      weather expectations
- [ ] An inspiration photo, if you have one

## 6. Travel & Accommodation

- [ ] Nearest airport(s) and suggested arrival day
- [ ] Recommended hotel(s) — name, address, booking link, price range, and
      why you recommend it (distance to venue, room block/discount code)
- [ ] Parking, shuttle, or rideshare notes

## 7. Registry

- [ ] Do you want a registry section at all, or a note that your presence
      is the gift?
- [ ] Registry name(s) and link(s) (e.g. Amazon, Zola, a honeymoon fund)
- [ ] A short intro message for this section

## 8. FAQ

Common ones to consider — answer any that apply, skip the rest:
- [ ] Are kids welcome?
- [ ] Is it a plus-one event, or is the guest list fixed per invite?
- [ ] Is there parking at the venue?
- [ ] What's the weather likely to be / is it indoor or outdoor?
- [ ] Are there dietary accommodations available?
- [ ] Is the ceremony/reception wheelchair accessible?
- [ ] Any gift policy notes, unplugged ceremony request, etc.?
- [ ] Anything else guests commonly ask you?

## 9. Gallery

- [ ] Send over the photos you'd like featured (engagement shoot, couple
      photos, etc.) and drop them in `public/img/gallery/` — I'll wire them
      into the gallery section.

## 10. Guest list (for RSVP)

This one's the most time-consuming but most important — RSVPs won't work
until the guest list is loaded. Easiest way: send a spreadsheet/CSV with one
row per guest:

```
first_name,last_name,party_label,max_guests,is_child,invited_events
```

- `party_label` groups people into a household (e.g. everyone in "The Smith
  Family" RSVPs together).
- `invited_events` is `ceremony,reception` or just one, for guests only
  invited to part of the day.

Send me the list (or paste it into the admin dashboard's "Bulk Import"
panel yourself) and I'll get everyone loaded in.
