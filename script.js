// ---- Config -------------------------------------------------------------
// Change this if your backend runs somewhere else.
const API_URL = "http://127.0.0.1:8000";
// Order must match model.classes_ (scikit-learn sorts class names alphabetically).
const CLASSES = [
  { name: "Entire home/apt", short: "E", color: "#ff6319" },
  { name: "Private room",    short: "P", color: "#00933c" },
  { name: "Shared room",     short: "S", color: "#0039a6" },
];

const BOROUGHS = {
  "Manhattan": { lat: 40.7831, lng: -73.9712, hoods: ["Harlem","East Harlem","Upper West Side","Upper East Side","Midtown","Hell's Kitchen","Chelsea","East Village","West Village","Greenwich Village","SoHo","Lower East Side","Chinatown","Washington Heights","Financial District","Murray Hill","Gramercy","Kips Bay","Nolita","Theater District","Tribeca","Inwood","Morningside Heights"] },
  "Brooklyn":  { lat: 40.6782, lng: -73.9442, hoods: ["Williamsburg","Bedford-Stuyvesant","Bushwick","Crown Heights","Greenpoint","Park Slope","Flatbush","Fort Greene","Prospect-Lefferts Gardens","Clinton Hill","Sunset Park","Cobble Hill","Carroll Gardens","Boerum Hill","Brooklyn Heights","Red Hook","DUMBO","Bay Ridge","East Flatbush","Gowanus","Windsor Terrace","Coney Island","Brighton Beach"] },
  "Queens":    { lat: 40.7282, lng: -73.7949, hoods: ["Astoria","Long Island City","Ridgewood","Flushing","Sunnyside","Jamaica","Woodside","Forest Hills","Jackson Heights","Elmhurst","Ditmars Steinway","Maspeth","Rockaway Beach","Kew Gardens","Corona","Bayside","Howard Beach"] },
  "Bronx":     { lat: 40.8448, lng: -73.8648, hoods: ["Kingsbridge","Concourse","Mott Haven","Fordham","Riverdale","Longwood","Morris Park","Port Morris","Wakefield","Williamsbridge","Woodlawn","Soundview","Pelham Bay"] },
  "Staten Island": { lat: 40.5795, lng: -74.1502, hoods: ["St. George","Tompkinsville","Stapleton","Great Kills","New Springville","Port Richmond","Tottenville","West Brighton","Concord","Midland Beach"] },
};


// ---- Elements -----------------------------------------------------------
const $ = (id) => document.getElementById(id);
const form = $("form"), boroughEl = $("neighbourhood_group"), hoodEl = $("neighbourhood");
const states = ["empty", "loading", "error", "result"];
const show = (name) => states.forEach((s) => ($(s).hidden = s !== name));

// ---- Borough / neighbourhood helpers ------------------------------------
boroughEl.innerHTML = '<option value="" disabled selected>Choose a borough</option>' +
  Object.keys(BOROUGHS).map((b) => `<option>${b}</option>`).join("");

boroughEl.addEventListener("change", () => {
  const b = BOROUGHS[boroughEl.value];
  $("hoods").innerHTML = b.hoods.map((h) => `<option value="${h}">`).join("");
  if (!form.latitude.value) form.latitude.value = b.lat;
  if (!form.longitude.value) form.longitude.value = b.lng;
});

// Random but realistic example: picks a borough, neighbourhood and a listing "style"
const rand = (a, b) => Math.random() * (b - a) + a;
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function randomSample() {
  const borough = pick(Object.keys(BOROUGHS));
  const b = BOROUGHS[borough];
  const style = pick([
    { price: [120, 450], nights: [1, 7],  hosts: [1, 4],  avail: [60, 365] },  // whole-place style
    { price: [45, 130],  nights: [1, 30], hosts: [1, 3],  avail: [0, 365] },   // private-room style
    { price: [25, 70],   nights: [1, 14], hosts: [2, 40], avail: [120, 365] }, // budget / shared style
  ]);
  const reviews = Math.random() < 0.2 ? 0 : randInt(1, 250);
  return {
    neighbourhood_group: borough,
    neighbourhood: pick(b.hoods),
    latitude: +(b.lat + rand(-0.05, 0.05)).toFixed(5),
    longitude: +(b.lng + rand(-0.05, 0.05)).toFixed(5),
    price: randInt(...style.price),
    minimum_nights: randInt(...style.nights),
    number_of_reviews: reviews,
    reviews_per_month: reviews ? +rand(0.05, 4).toFixed(2) : 0,
    calculated_host_listings_count: randInt(...style.hosts),
    availability_365: randInt(...style.avail),
  };
}

$("sample").addEventListener("click", () => {
  const s = randomSample();
  boroughEl.value = s.neighbourhood_group;
  $("hoods").innerHTML = BOROUGHS[s.neighbourhood_group].hoods.map((h) => `<option value="${h}">`).join("");
  Object.entries(s).forEach(([k, v]) => { if (form[k]) form[k].value = v; });
});

form.addEventListener("reset", () => { $("hoods").innerHTML = ""; show("empty"); });

// ---- Submit -------------------------------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;

  const f = new FormData(form);
  const num = (k) => Number(f.get(k));
  const payload = {
    latitude: num("latitude"), longitude: num("longitude"), price: num("price"),
    minimum_nights: num("minimum_nights"), number_of_reviews: num("number_of_reviews"),
    reviews_per_month: num("reviews_per_month"),
    calculated_host_listings_count: num("calculated_host_listings_count"),
    availability_365: num("availability_365"),
    neighbourhood_group: f.get("neighbourhood_group").trim(),
    neighbourhood: f.get("neighbourhood").trim(),
  };

  const btn = $("submit");
  btn.disabled = true; show("loading");
  try {
    const base = ($("api")?.value.trim() || API_URL).replace(/\/+$/, "");
    const res = await fetch(`${base}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeError(res.status, data));
    render(data);
  } catch (err) {
    $("error-msg").textContent = err instanceof TypeError
      ? `Can't reach the API at ${$("api")?.value.trim() || API_URL}. Start the backend with: uvicorn main:app --reload`
      : err.message;
    show("error");
  } finally {
    btn.disabled = false;
  }
});

function describeError(status, data) {
  if (status === 422 && Array.isArray(data.detail)) {
    return data.detail.map((d) => `${d.loc.slice(-1)[0]}: ${d.msg}`).join(". ");
  }
  return data.detail ? String(data.detail) : `The server returned an error (${status}).`;
}

// ---- Render -------------------------------------------------------------
function render(data) {
  const probs = data.Probability || [];
  const label = data.Predicted_room_type;
  const meta = (i) => CLASSES[i] || { name: `Class ${i + 1}`, short: "?", color: "#888" };
  const topIdx = probs.indexOf(Math.max(...probs));
  const winner = CLASSES.find((c) => c.name === label) || meta(topIdx);

  $("result-bullet").style.background = winner.color;
  $("result-bullet").textContent = winner.short;
  $("result-label").textContent = label;
  const top = Math.max(...probs) * 100;
  $("result-conf").textContent = "Confidence in this prediction";
  $("ring").style.setProperty("--c", winner.color);
  $("ring").style.setProperty("--p", "0");
  $("ring-val").textContent = `${top.toFixed(0)}%`;
  requestAnimationFrame(() => requestAnimationFrame(() => $("ring").style.setProperty("--p", top)));

  $("bars").innerHTML = probs.map((p, i) => {
    const m = meta(i), pct = (p * 100).toFixed(1);
    return `<li class="${i === topIdx ? "top" : ""}">
      <span class="name">${m.name}</span><span class="pct">${pct}%</span>
      <span class="track"><span class="fill" style="background:${m.color}" data-w="${pct}"></span></span>
    </li>`;
  }).join("");

  show("result");
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelectorAll(".fill").forEach((el) => (el.style.width = el.dataset.w + "%"))));
}
