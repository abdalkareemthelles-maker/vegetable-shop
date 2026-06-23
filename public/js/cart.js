document.addEventListener("DOMContentLoaded", () => {

  // ================= PLUS =================
  document.querySelectorAll(".plus").forEach(btn => {
    btn.addEventListener("click", async () => {

      const id = btn.dataset.id;

      const res = await fetch(`/increase/${id}`);
      const data = await res.json();

      if (!data.success) return;

      const row = btn.closest("tr");

      row.querySelector(".qty").innerText = data.qty;
      row.querySelector(".total").innerText = data.total + " $";

      const counter = document.getElementById("cart-counter");
      if (counter) counter.innerText = data.cartCount;

    });
  });

  // ================= MINUS =================
  document.querySelectorAll(".minus").forEach(btn => {
    btn.addEventListener("click", async () => {

      const id = btn.dataset.id;

      const res = await fetch(`/decrease/${id}`);
      const data = await res.json();

      if (!data.success) return;

      const row = btn.closest("tr");

      if (data.qty === 0) {
        row.remove(); // 🔥 حذف الصف إذا الكمية صفر
      } else {
        row.querySelector(".qty").innerText = data.qty;
        row.querySelector(".total").innerText = data.total + " $";
      }

      const counter = document.getElementById("cart-counter");
      if (counter) counter.innerText = data.cartCount;

    });
  });

  // ================= DELETE =================
  document.querySelectorAll(".delete").forEach(btn => {
    btn.addEventListener("click", async () => {

      const id = btn.dataset.id;

      const res = await fetch(`/delete-from-cart/${id}`);
      const data = await res.json();

      if (!data.success) return;

      btn.closest("tr").remove(); // 🔥 حذف مباشر

      const counter = document.getElementById("cart-counter");
      if (counter) counter.innerText = data.cartCount;

    });
  });

});