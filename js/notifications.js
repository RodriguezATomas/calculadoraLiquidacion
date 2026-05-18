import { actions, selectors, subscribe } from "./app-state.js";

export const initNotifications = () => {
  const button = document.getElementById("notificationsButton");
  const badge = document.getElementById("notificationsBadge");
  const dropdown = document.getElementById("notificationsDropdown");
  const list = document.getElementById("notificationsList");
  const markAllButton = document.getElementById("markAllNotificationsRead");

  if (!button || !badge || !dropdown || !list || !markAllButton) {
    return;
  }

  const closeDropdown = () => {
    dropdown.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };

  const openDropdown = () => {
    dropdown.hidden = false;
    button.setAttribute("aria-expanded", "true");
  };

  button.addEventListener("click", () => {
    if (dropdown.hidden) {
      openDropdown();
      return;
    }

    closeDropdown();
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.contains(event.target) && !button.contains(event.target)) {
      closeDropdown();
    }
  });

  markAllButton.addEventListener("click", () => {
    actions.markAllNotificationsRead();
  });

  subscribe((state) => {
    badge.textContent = `${selectors.unreadNotifications(state)}`;
    list.innerHTML = state.notifications.map((item) => `
      <article class="notification-item ${item.read ? "is-read" : ""}">
        <strong>${item.title}</strong>
        <p>${item.body}</p>
        <small>${new Date(item.createdAt).toLocaleString("es-AR")}</small>
        ${item.read ? "" : `<button type="button" data-notification-read="${item.id}">Marcar como leída</button>`}
      </article>
    `).join("");

    list.querySelectorAll("[data-notification-read]").forEach((notificationButton) => {
      notificationButton.addEventListener("click", () => {
        actions.markNotificationRead(notificationButton.getAttribute("data-notification-read"));
      });
    });
  });
};
