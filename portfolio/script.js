// Set current year in footer
document.getElementById("year").textContent = new Date().getFullYear();

// Simple contact form handler (no backend; shows a message only)
const form = document.getElementById("contact-form");
const status = document.getElementById("form-status");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = form.elements["name"].value.trim();
  status.textContent = `Thanks, ${name}! Your message has been noted.`;
  form.reset();
});
