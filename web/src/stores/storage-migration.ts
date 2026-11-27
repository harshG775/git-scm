/** Copy persisted app state to a renamed storage key without discarding existing user data. */
export function migrateStorageKey(key: string, legacyKey: string) {
    if (typeof localStorage === "undefined") return;
    try {
        const legacyValue = localStorage.getItem(legacyKey);
        if (localStorage.getItem(key) === null && legacyValue !== null) {
            localStorage.setItem(key, legacyValue);
        }
        localStorage.removeItem(legacyKey);
    } catch (error) {
        console.error(`Could not migrate local storage key ${legacyKey} to ${key}`, error);
    }
}
