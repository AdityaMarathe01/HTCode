// LocationIQ Reverse Geocoding helper
// Usage: getLocationIQAddress(lat, lon, apiKey)
async function getLocationIQAddress(lat, lon, apiKey) {
  const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lon}&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('LocationIQ API error');
  const data = await resp.json();
  if (data && data.display_name) {
    // Try to extract district/state if possible
    let district = data.address && (data.address.city || data.address.town || data.address.village || data.address.county || data.address.state_district || '');
    let state = data.address && (data.address.state || '');
    return { formatted: data.display_name, district, state };
  }
  throw new Error('No address found');
}
window.getLocationIQAddress = getLocationIQAddress;
