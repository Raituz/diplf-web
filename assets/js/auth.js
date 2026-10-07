/**
 * DIP LF - Sistema de Autenticación y Roles
 * Administrador: charquin50@gmail.com / oxh4sfb5e2
 * Clientes: Visitantes generales
 */

const DEFAULT_SUPER_ADMIN = {
  email: 'charquin50@gmail.com',
  pass: 'oxh4sfb5e2',
  role: 'admin',
  name: 'Administrador Principal',
  date: '2026-10-06'
};

const AUTH_STORAGE_KEY = 'diplf_auth_user';
const USERS_STORAGE_KEY = 'diplf_authorized_users';

// Obtener lista de usuarios autorizados
function getAuthorizedUsers() {
  try {
    const saved = localStorage.getItem(USERS_STORAGE_KEY);
    if (saved) {
      const users = JSON.parse(saved);
      // Asegurar que el superadmin siempre exista
      const hasSuperAdmin = users.some(u => u.email.toLowerCase() === DEFAULT_SUPER_ADMIN.email.toLowerCase());
      if (!hasSuperAdmin) {
        users.unshift(DEFAULT_SUPER_ADMIN);
        saveAuthorizedUsers(users);
      }
      return users;
    }
  } catch (e) {
    console.error('Error al cargar usuarios:', e);
  }
  const initial = [DEFAULT_SUPER_ADMIN];
  saveAuthorizedUsers(initial);
  return initial;
}

// Guardar lista de usuarios
function saveAuthorizedUsers(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Error al guardar usuarios:', e);
  }
}

// Obtener usuario actualmente con sesión activa
function getCurrentUser() {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error al leer sesión:', e);
  }
  return null;
}

// Verificar si el usuario actual es Administrador
function isAdmin() {
  const user = getCurrentUser();
  return user && (user.role === 'admin' || user.role === 'administrador');
}

// Iniciar sesión
function loginUser(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  // Validar credenciales maestras directamente por seguridad
  if (cleanEmail === DEFAULT_SUPER_ADMIN.email.toLowerCase() && cleanPass === DEFAULT_SUPER_ADMIN.pass) {
    const authData = {
      email: DEFAULT_SUPER_ADMIN.email,
      name: DEFAULT_SUPER_ADMIN.name,
      role: 'admin',
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    window.dispatchEvent(new Event('diplf_auth_changed'));
    return { success: true, user: authData };
  }

  // Buscar en usuarios autorizados
  const users = getAuthorizedUsers();
  const found = users.find(u => u.email.toLowerCase() === cleanEmail && u.pass === cleanPass);

  if (found) {
    const authData = {
      email: found.email,
      name: found.name || 'Administrador',
      role: found.role || 'admin',
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    window.dispatchEvent(new Event('diplf_auth_changed'));
    return { success: true, user: authData };
  }

  return { success: false, message: 'Correo o contraseña incorrectos.' };
}

// Cerrar sesión
function logoutUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event('diplf_auth_changed'));
}

// Agregar o actualizar un usuario con rol
function assignUserRole(email, password, role, name = '') {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, message: 'Correo electrónico inválido.' };
  }
  if (!password || password.trim().length < 4) {
    return { success: false, message: 'La contraseña debe tener al menos 4 caracteres.' };
  }

  const users = getAuthorizedUsers();
  const index = users.findIndex(u => u.email.toLowerCase() === cleanEmail);

  const newUser = {
    email: cleanEmail,
    pass: password.trim(),
    role: role || 'admin',
    name: name.trim() || cleanEmail.split('@')[0],
    date: new Date().toLocaleDateString('es-VE')
  };

  if (index >= 0) {
    // Si es el super admin, no permitir degradar su rol
    if (cleanEmail === DEFAULT_SUPER_ADMIN.email.toLowerCase()) {
      newUser.role = 'admin';
    }
    users[index] = newUser;
  } else {
    users.push(newUser);
  }

  saveAuthorizedUsers(users);
  return { success: true, user: newUser };
}

// Eliminar usuario
function removeUserRole(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanEmail === DEFAULT_SUPER_ADMIN.email.toLowerCase()) {
    return { success: false, message: 'No se puede eliminar al Administrador Principal.' };
  }

  let users = getAuthorizedUsers();
  users = users.filter(u => u.email.toLowerCase() !== cleanEmail);
  saveAuthorizedUsers(users);

  // Si el usuario eliminado es el que está en sesión, cerrar sesión
  const current = getCurrentUser();
  if (current && current.email.toLowerCase() === cleanEmail) {
    logoutUser();
  }

  return { success: true };
}
