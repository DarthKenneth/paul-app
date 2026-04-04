/**
 * Seed script — injects fake customers into AsyncStorage via the running Expo app.
 * Run from the Expo developer tools console, or paste into a temporary dev button.
 *
 * Since we can't write to AsyncStorage from Node directly (it's on-device),
 * this script is meant to be loaded inside the app. We'll create a temp screen trigger.
 */

// This file just holds the data. The actual injection happens via SeedButton below.

export const SEED_CUSTOMERS = [
  // ── Overdue (serviced 400-700 days ago) ──
  { name: 'Angela Martinez',   email: 'angela.m@gmail.com',    phone: '(512) 555-0101', address: '4201 S Congress Ave',   city: 'Austin',        state: 'TX', zipCode: '78745', serviceDaysAgo: 450 },
  { name: 'Brian O\'Connell',  email: 'boconnell@yahoo.com',   phone: '(303) 555-0202', address: '1888 Blake St',         city: 'Denver',        state: 'CO', zipCode: '80202', serviceDaysAgo: 520 },
  { name: 'Carmen Delgado',    email: 'carmen.d@outlook.com',   phone: '(305) 555-0303', address: '7700 NW 2nd Ave',       city: 'Miami',         state: 'FL', zipCode: '33150', serviceDaysAgo: 680 },
  { name: 'Derek Washington',  email: 'dwash77@gmail.com',      phone: '(404) 555-0404', address: '255 Peachtree St NE',   city: 'Atlanta',       state: 'GA', zipCode: '30303', serviceDaysAgo: 400 },
  { name: 'Elena Kowalski',    email: 'elena.k@protonmail.com', phone: '(773) 555-0505', address: '3400 N Halsted St',     city: 'Chicago',       state: 'IL', zipCode: '60657', serviceDaysAgo: 600 },

  // ── Due within 30 days (serviced 336-364 days ago) ──
  { name: 'Frank Nakamura',    email: 'fnakamura@icloud.com',   phone: '(206) 555-0606', address: '801 Pine St',           city: 'Seattle',       state: 'WA', zipCode: '98101', serviceDaysAgo: 340 },
  { name: 'Grace Liu',         email: 'grace.liu@gmail.com',    phone: '(415) 555-0707', address: '560 Mission St',        city: 'San Francisco', state: 'CA', zipCode: '94105', serviceDaysAgo: 355 },
  { name: 'Hassan Patel',      email: 'hpatel@outlook.com',     phone: '(713) 555-0808', address: '1200 McKinney St',      city: 'Houston',       state: 'TX', zipCode: '77010', serviceDaysAgo: 360 },
  { name: 'Irene Johansson',   email: 'irene.j@gmail.com',      phone: '(612) 555-0909', address: '250 Marquette Ave',     city: 'Minneapolis',   state: 'MN', zipCode: '55401', serviceDaysAgo: 350 },

  // ── Due within 31-60 days (serviced 306-334 days ago) ──
  { name: 'James Okafor',      email: 'jokafor@yahoo.com',      phone: '(202) 555-1010', address: '1600 K St NW',          city: 'Washington',    state: 'DC', zipCode: '20006', serviceDaysAgo: 310 },
  { name: 'Karen Bjornsson',   email: 'karen.b@gmail.com',      phone: '(503) 555-1111', address: '920 SW 6th Ave',        city: 'Portland',      state: 'OR', zipCode: '97204', serviceDaysAgo: 325 },
  { name: 'Leo Fernandez',     email: 'leofern@hotmail.com',    phone: '(602) 555-1212', address: '401 E Jefferson St',    city: 'Phoenix',       state: 'AZ', zipCode: '85004', serviceDaysAgo: 315 },

  // ── Due within 61-90 days (serviced 276-304 days ago) ──
  { name: 'Mika Tanaka',       email: 'mika.t@gmail.com',       phone: '(808) 555-1313', address: '1450 Ala Moana Blvd',   city: 'Honolulu',      state: 'HI', zipCode: '96814', serviceDaysAgo: 280 },
  { name: 'Nora Svensson',     email: 'noras@icloud.com',       phone: '(615) 555-1414', address: '501 Broadway',          city: 'Nashville',     state: 'TN', zipCode: '37203', serviceDaysAgo: 295 },
  { name: 'Oscar Gutierrez',   email: 'oscarg@yahoo.com',       phone: '(210) 555-1515', address: '300 Alamo Plaza',       city: 'San Antonio',   state: 'TX', zipCode: '78205', serviceDaysAgo: 290 },

  // ── Later / healthy (serviced 0-274 days ago) ──
  { name: 'Priya Sharma',      email: 'priya.s@gmail.com',      phone: '(919) 555-1616', address: '400 Fayetteville St',   city: 'Raleigh',       state: 'NC', zipCode: '27601', serviceDaysAgo: 200 },
  { name: 'Quinn Gallagher',   email: 'quinng@outlook.com',     phone: '(617) 555-1717', address: '1 Beacon St',           city: 'Boston',        state: 'MA', zipCode: '02108', serviceDaysAgo: 150 },
  { name: 'Roberto Diaz',      email: 'rdiaz@gmail.com',        phone: '(702) 555-1818', address: '3570 Las Vegas Blvd S', city: 'Las Vegas',     state: 'NV', zipCode: '89109', serviceDaysAgo: 90 },
  { name: 'Sofia Andersson',   email: 'sofia.a@protonmail.com', phone: '(312) 555-1919', address: '875 N Michigan Ave',    city: 'Chicago',       state: 'IL', zipCode: '60611', serviceDaysAgo: 45 },
  { name: 'Trevor Kim',        email: 'tkim@icloud.com',        phone: '(213) 555-2020', address: '633 W 5th St',          city: 'Los Angeles',   state: 'CA', zipCode: '90071', serviceDaysAgo: 30 },
  { name: 'Uma Krishnan',      email: 'umak@gmail.com',         phone: '(469) 555-2121', address: '1717 Main St',          city: 'Dallas',        state: 'TX', zipCode: '75201', serviceDaysAgo: 10 },
  { name: 'Victor Popov',      email: 'vpopov@yahoo.com',       phone: '(407) 555-2222', address: '400 W Church St',       city: 'Orlando',       state: 'FL', zipCode: '32801', serviceDaysAgo: 5 },
  { name: 'Wendy Chen',        email: 'wendy.c@gmail.com',      phone: '(858) 555-2323', address: '750 B St',              city: 'San Diego',     state: 'CA', zipCode: '92101', serviceDaysAgo: 0 },

  // ── Never serviced ──
  { name: 'Xavier Moreau',     email: 'xmoreau@outlook.com',    phone: '(504) 555-2424', address: '334 Royal St',          city: 'New Orleans',   state: 'LA', zipCode: '70130', serviceDaysAgo: null },
  { name: 'Yuki Watanabe',     email: 'yuki.w@gmail.com',       phone: '(412) 555-2525', address: '600 Grant St',          city: 'Pittsburgh',    state: 'PA', zipCode: '15219', serviceDaysAgo: null },
  { name: 'Zara Ibrahim',      email: 'zarai@icloud.com',       phone: '(704) 555-2626', address: '301 S Tryon St',        city: 'Charlotte',     state: 'NC', zipCode: '28202', serviceDaysAgo: null },
];
