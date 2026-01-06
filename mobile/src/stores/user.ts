import { defineStore } from "pinia";
import { ref } from "vue";

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
}

export const useUserStore = defineStore("user", () => {
  const user = ref<UserProfile | null>(null);
  const isLoggedIn = ref(false);

  const setUser = (profile: UserProfile) => {
    user.value = profile;
    isLoggedIn.value = true;
    localStorage.setItem("user", JSON.stringify(profile));
  };

  const logout = () => {
    user.value = null;
    isLoggedIn.value = false;
    localStorage.removeItem("user");
  };

  const initUser = () => {
    const saved = localStorage.getItem("user");
    if (saved) {
      try {
        user.value = JSON.parse(saved);
        isLoggedIn.value = true;
      } catch (e) {
        console.error("Failed to parse user data");
      }
    }
  };

  return {
    user,
    isLoggedIn,
    setUser,
    logout,
    initUser,
  };
});
