import { RenderPreset } from '../types';

export const longCodePreset: RenderPreset = {
  id: "long-code",
  name: "长代码块",
  description: "测试长代码块的渲染性能",
  content: `# 超长代码块（TypeScript）

\`\`\`typescript
/**
 * Represents a user in the system.
 */
interface UserProfile {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  lastLogin: Date;
  isActive: boolean;
  roles: ('admin' | 'editor' | 'viewer')[];
}

/**
 * A service for managing user profiles.
 * Provides methods for CRUD operations and other user-related actions.
 */
class UserProfileService {
  private users: Map<string, UserProfile> = new Map();

  constructor(initialUsers: UserProfile[] = []) {
    for (const user of initialUsers) {
      this.users.set(user.id, user);
    }
    console.log('UserProfileService initialized.');
  }

  /**
   * Adds a new user to the system.
   * @param userData - The data for the new user.
   * @returns The newly created user profile.
   * @throws If a user with the same ID already exists.
   */
  addUser(userData: Omit<UserProfile, 'id' | 'createdAt' | 'lastLogin'>): UserProfile {
    const id = crypto.randomUUID();
    if (this.users.has(id)) {
      throw new Error('A user with this ID already exists.');
    }

    const newUser: UserProfile = {
      ...userData,
      id,
      createdAt: new Date(),
      lastLogin: new Date(),
    };

    this.users.set(id, newUser);
    console.log(\`User "\${newUser.username}" added with ID: \${id}\`);
    return newUser;
  }

  /**
   * Retrieves a user by their ID.
   * @param id - The ID of the user to retrieve.
   * @returns The user profile or undefined if not found.
   */
  getUserById(id: string): UserProfile | undefined {
    return this.users.get(id);
  }

  /**
   * Updates an existing user's profile.
   * @param id - The ID of the user to update.
   * @param updates - An object containing the fields to update.
   * @returns The updated user profile.
   * @throws If the user is not found.
   */
  updateUser(id: string, updates: Partial<Omit<UserProfile, 'id' | 'createdAt'>>): UserProfile {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(\`User with ID "\${id}" not found.\`);
    }

    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    console.log(\`User "\${user.username}" has been updated.\`);
    return updatedUser;
  }

  /**
   * Deletes a user from the system.
   * @param id - The ID of the user to delete.
   * @returns True if the user was deleted, false otherwise.
   */
  deleteUser(id: string): boolean {
    const user = this.users.get(id);
    if (user) {
      this.users.delete(id);
      console.log(\`User "\${user.username}" has been deleted.\`);
      return true;
    }
    return false;
  }

  /**
   * Retrieves all users, optionally filtered by a role.
   * @param role - An optional role to filter users by.
   * @returns An array of user profiles.
   */
  getAllUsers(role?: 'admin' | 'editor' | 'viewer'): UserProfile[] {
    const allUsers = Array.from(this.users.values());
    if (role) {
      return allUsers.filter(user => user.roles.includes(role));
    }
    return allUsers;
  }

  /**
   * Deactivates a user's account.
   * @param id - The ID of the user to deactivate.
   */
  deactivateUser(id: string): void {
    this.updateUser(id, { isActive: false });
    console.log(\`User with ID "\${id}" has been deactivated.\`);
  }

  /**
   * Records a login event for a user.
   * @param id - The ID of the user logging in.
   */
  recordLogin(id: string): void {
    this.updateUser(id, { lastLogin: new Date() });
  }
}

// Example usage:
const userService = new UserProfileService();
userService.addUser({
  username: 'miaotouy',
  email: 'miaotouy@example.com',
  isActive: true,
  roles: ['admin', 'editor'],
});

const allAdmins = userService.getAllUsers('admin');
console.log('Current admins:', allAdmins);
\`\`\``,
};
