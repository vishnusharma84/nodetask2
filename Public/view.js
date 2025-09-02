$(document).ready(function () {
  const socket = window.socket || io(); 
  const $tbody = $("#usersTable tbody");

  let allUsers = [];
  let liveUsers = {};

  // Fetch all users
  function fetchUsers() {
    $.get("/users", function (res) {
      if (res.success) {
        allUsers = res.users;
        renderUsers();
      }
    });
  }

  // Render users in table
  function renderUsers() {
    $tbody.empty();
    allUsers.forEach(user => {
      const emailKey = (user.email || "").toLowerCase();
      const isOnline = liveUsers[emailKey] ? true : false;

      $tbody.append(`
        <tr>
          <td>${user.firstName || ""}</td>
          <td>${user.lastName || ""}</td>
          <td>${user.mobile || ""}</td>
          <td>${user.email || ""}</td>
          <td>${user.street || ""}, ${user.city || ""}, ${user.state || ""}, ${user.country || ""}</td>
          <td>${user.loginId || ""}</td>
          <td>${user.createdAt ? new Date(user.createdAt).toLocaleString() : ""}</td>
          <td>${user.updatedAt ? new Date(user.updatedAt).toLocaleString() : ""}</td>
          <td class="${isOnline ? "online" : "offline"}">${isOnline ? "Online" : "Offline"}</td>
        </tr>
      `);
    });
  }

  // Listen live users update
  socket.on("live_users_update", users => {
    liveUsers = {};
    users.forEach(u => {
      if (u.email) liveUsers[u.email.toLowerCase()] = true;
    });
    renderUsers();
  });

  socket.on("user_created_db", user => {
    allUsers.push(user);
    renderUsers();
  });

  socket.emit("viewer_join");

  //  Logout
  $("#logoutBtn").click(() => {
    socket.emit("logout");
    localStorage.removeItem("user");
    location.reload(); // back to login
  });

  fetchUsers();
});
  const loggedInViaLogin = localStorage.getItem("loggedInViaLogin");
  const $logoutBtn = $("#logoutBtn");
  if (loggedInViaLogin === "true") $logoutBtn.show();

  $logoutBtn.click(() => {
    localStorage.removeItem("loggedInViaLogin");
    localStorage.removeItem("user");
    window.location.href = "login.html";
  });