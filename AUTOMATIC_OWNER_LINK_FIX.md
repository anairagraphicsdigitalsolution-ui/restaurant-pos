# Automatic Restaurant Owner Linking

When Super Admin creates an Admin user for a restaurant, the API now automatically sets `restaurants.owner_id` to that Admin user id if the restaurant currently has no owner.

`profiles.restaurant_id` remains the authoritative tenant link. The owner_id mirror keeps legacy owner-based pages and RLS compatible.

No new DB migration is required for this code change. Existing NULL owner_id records are handled by the previously-applied repair migration.
