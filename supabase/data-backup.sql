SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict 9Ao3vo5pVcsz6MbllKiRDqVXqxZoUvqJsNDC0NsD71fJZmA5MW5ckt1WdTpdEIz

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'f146e695-6f5c-4bf1-8560-9632f427975b', 'authenticated', 'authenticated', 'anairagraphicsdigitalsolution@gmail.com', '$2a$10$m6EJeUA3JtFNbIjLkRD4s.1DrTNw1MdJVMzdulTzt2HQm.vIc1e7W', '2026-03-29 19:08:42.749729+00', NULL, '', NULL, '', '2026-08-16 07:02:49.858339+00', '', '', NULL, '2026-08-16 08:06:58.197275+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-03-29 19:08:42.729884+00', '2026-08-16 08:06:58.245626+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'e5896e19-6bc0-4671-a071-798b2cf1b540', 'authenticated', 'authenticated', 'techanaira@gmail.com', '$2a$10$Vdor5piTHqKT6QmPSjAYIOGwYzZfubGlm0MQBHjGxpoW5g.2EgXmC', '2026-08-16 06:02:28.20384+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-08-16 07:26:09.781215+00', '{"provider": "email", "providers": ["email"]}', '{"name": "Ankur Verma", "role": "admin", "restaurant_id": "2efbb5f5-3975-4a41-934d-335b61f83bfa", "email_verified": true}', NULL, '2026-08-16 06:02:28.179436+00', '2026-08-16 07:26:09.818595+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', 'authenticated', 'authenticated', 'chaichaatandchapati@gmail.com', '$2a$10$KFbzt5gd24DePOgykK6GFeGOcVZF6F3SzBf5Z.2zy8GywFGAVSLGC', '2026-03-29 19:49:07.010237+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-07-21 17:10:39.705044+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-03-29 19:49:06.994893+00', '2026-07-22 12:14:27.742254+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '60e9a4ed-4054-4ab3-af83-b893dbb4e108', 'authenticated', 'authenticated', 'nayrathakur26112019@gmail.com', '$2a$10$WHpQLP9WbrQH70zQlU/oWOcDeM/cgin2DP7s0z9pD7cYUMr692miC', '2026-03-28 18:55:30.86537+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-08-16 06:44:42.254604+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-03-28 18:55:30.833583+00', '2026-08-16 06:44:42.268963+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'authenticated', 'authenticated', 'cafenh3bashing@gmail.com', '$2a$10$rzfP5QPOa5dBvqT6DYa8e.12ZwqWzKVccHdpZ7RqvwDxS4x.tTZxa', '2026-03-29 18:53:37.620581+00', NULL, '', NULL, '775e6cfd1c584233efeaefb8391a4e6f7ece756d302cd6badfcfb529', '2026-08-16 07:07:02.387268+00', '', '', NULL, '2026-08-16 07:49:10.655272+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-03-29 18:53:37.592446+00', '2026-08-16 07:49:10.680871+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('60e9a4ed-4054-4ab3-af83-b893dbb4e108', '60e9a4ed-4054-4ab3-af83-b893dbb4e108', '{"sub": "60e9a4ed-4054-4ab3-af83-b893dbb4e108", "email": "nayrathakur26112019@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-03-28 18:55:30.846625+00', '2026-03-28 18:55:30.847529+00', '2026-03-28 18:55:30.847529+00', 'da548917-938f-455e-aaf6-e403f1a87d87'),
	('75a0678a-6ca2-46b9-9e48-0ee91715650e', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{"sub": "75a0678a-6ca2-46b9-9e48-0ee91715650e", "email": "cafenh3bashing@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-03-29 18:53:37.607259+00', '2026-03-29 18:53:37.607311+00', '2026-03-29 18:53:37.607311+00', '4b6e4a54-4447-470d-ac2f-d1c99ce701ba'),
	('f146e695-6f5c-4bf1-8560-9632f427975b', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{"sub": "f146e695-6f5c-4bf1-8560-9632f427975b", "email": "anairagraphicsdigitalsolution@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-03-29 19:08:42.739107+00', '2026-03-29 19:08:42.73916+00', '2026-03-29 19:08:42.73916+00', 'b8264b6f-2bc5-4f39-859a-ed4d496f9b58'),
	('ddc6c5f2-5f38-482d-b51f-66917a523f04', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '{"sub": "ddc6c5f2-5f38-482d-b51f-66917a523f04", "email": "chaichaatandchapati@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-03-29 19:49:07.0046+00', '2026-03-29 19:49:07.004651+00', '2026-03-29 19:49:07.004651+00', 'fe7a56c3-20b3-4e34-8d8d-7b5978e8d925'),
	('e5896e19-6bc0-4671-a071-798b2cf1b540', 'e5896e19-6bc0-4671-a071-798b2cf1b540', '{"sub": "e5896e19-6bc0-4671-a071-798b2cf1b540", "email": "techanaira@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-08-16 06:02:28.193219+00', '2026-08-16 06:02:28.193564+00', '2026-08-16 06:02:28.193564+00', 'f0bfeabf-8cb1-4f95-844b-9b8104a71d75');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('4a0ad6db-9c75-47a9-8cff-acacdd0fca04', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-08-16 08:06:58.198536+00', '2026-08-16 08:06:58.198536+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 OPR/133.0.0.0', '49.43.142.39', NULL, NULL, NULL, NULL, NULL),
	('3cbc29a8-21f6-4c15-8dec-99717fa72191', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '2026-07-21 17:10:39.705503+00', '2026-07-22 12:14:27.746499+00', NULL, 'aal1', NULL, '2026-07-22 12:14:27.745817', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', '49.43.143.47', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('4a0ad6db-9c75-47a9-8cff-acacdd0fca04', '2026-08-16 08:06:58.248761+00', '2026-08-16 08:06:58.248761+00', 'password', 'edae3097-f0ae-4053-ae89-5226e9e9f799'),
	('3cbc29a8-21f6-4c15-8dec-99717fa72191', '2026-07-21 17:10:39.737974+00', '2026-07-21 17:10:39.737974+00', 'password', '87015ca6-be49-4ab6-8c8f-e1df9f1e27b5');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."one_time_tokens" ("id", "user_id", "token_type", "token_hash", "relates_to", "created_at", "updated_at") VALUES
	('81dfbcc2-871f-4411-8895-cb8ac0b4e669', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'recovery_token', '775e6cfd1c584233efeaefb8391a4e6f7ece756d302cd6badfcfb529', 'cafenh3bashing@gmail.com', '2026-08-16 07:07:04.088953', '2026-08-16 07:07:04.088953');


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 462, 's6uhtv54gq7h', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', true, '2026-07-21 17:10:39.723822+00', '2026-07-22 12:14:27.716866+00', NULL, '3cbc29a8-21f6-4c15-8dec-99717fa72191'),
	('00000000-0000-0000-0000-000000000000', 469, 'fxz7hggldguy', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', false, '2026-07-22 12:14:27.736345+00', '2026-07-22 12:14:27.736345+00', 's6uhtv54gq7h', '3cbc29a8-21f6-4c15-8dec-99717fa72191'),
	('00000000-0000-0000-0000-000000000000', 518, '2kywmmzt7ppi', 'f146e695-6f5c-4bf1-8560-9632f427975b', false, '2026-08-16 08:06:58.221667+00', '2026-08-16 08:06:58.221667+00', NULL, '4a0ad6db-9c75-47a9-8cff-acacdd0fca04');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: restaurants; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."restaurants" ("id", "name", "logo", "owner_id", "gst_enabled", "gst_rate", "slug", "cover_image", "opening_time", "cuisine", "description", "address", "gst", "owner_name", "phone", "status") VALUES
	('8118f344-f928-42b8-950d-7910fd7f09d4', 'Chai Chaat and Chapati', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/logos/logo-8118f344-f928-42b8-950d-7910fd7f09d4-1774983619483.png', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', true, 5, 'chai-chaat-and-chapati', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active'),
	('b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'NH3 Restaurant', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/logos/logo-b2d13e4b-7e68-4a70-b9b7-aaff5b137b53-1774980825134.png', '75a0678a-6ca2-46b9-9e48-0ee91715650e', false, 5, 'nh3-restaurant', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/restaurant-covers/cover-b2d13e4b-7e68-4a70-b9b7-aaff5b137b53-1783980143404.png', '9 am to 11 pm ', 'Veg and Non veg', 'Family Restaurant', NULL, NULL, NULL, NULL, 'active'),
	('2efbb5f5-3975-4a41-934d-335b61f83bfa', 'parampra', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/logos/logo-8118f344-f928-42b8-950d-7910fd7f09d4-1774983619483.png', NULL, true, 5, NULL, NULL, NULL, NULL, NULL, 'Vill mahili po archhandi distt kullu hp 175104', NULL, 'Ankur Verma', '8091310084', 'active');


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."audit_logs" ("id", "restaurant_id", "actor_id", "action", "entity_type", "entity_id", "before_data", "after_data", "metadata", "created_at") VALUES
	('1f3a8053-eb94-464a-88c8-f4ecc7020354', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '354b451d-05bd-439c-b333-c6266d8c02d1', '{"status": "pending"}', '{"reason": null, "status": "preparing"}', NULL, '2026-08-15 14:43:56.913622+00'),
	('67494918-c2c8-4362-9c19-b4624d0e4f5c', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '354b451d-05bd-439c-b333-c6266d8c02d1', '{"status": "preparing"}', '{"reason": null, "status": "done"}', NULL, '2026-08-15 14:43:58.794328+00'),
	('7fae81bf-d774-4b02-af22-911107077594', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '354b451d-05bd-439c-b333-c6266d8c02d1', '{"status": "done"}', '{"reason": null, "status": "done"}', NULL, '2026-08-15 14:44:07.486699+00'),
	('6bbb7c4f-f505-4a14-87f0-254c5382d78c', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '9c8d2eea-6f5c-4a55-bd88-62ac2e9a68ab', '{"status": "pending"}', '{"reason": null, "status": "done"}', NULL, '2026-08-15 14:57:51.95376+00'),
	('6bf93668-ccc9-4fbb-b6ba-9492ba8e8e6a', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '9c8d2eea-6f5c-4a55-bd88-62ac2e9a68ab', '{"status": "done"}', '{"reason": null, "status": "done"}', NULL, '2026-08-15 15:02:54.07944+00'),
	('6fba8ffc-4d9b-4103-b626-b687e93090ba', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', 'bfad9ef6-cd8d-4f65-97dc-e614655c4fd0', '{"status": "pending"}', '{"reason": null, "status": "done"}', NULL, '2026-08-15 15:03:27.89531+00'),
	('7e7f8e7f-779f-4905-8575-0c8149bf5d81', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', 'be59b3a2-a275-4899-be8a-c4d88d5525c1', '{"status": "pending"}', '{"reason": null, "status": "done"}', NULL, '2026-08-15 15:47:49.273123+00'),
	('736d422d-b97b-48d7-b8a7-6ec4fe21ca75', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '21029d13-dbf7-46ca-9da3-86f039f63fba', '{"status": "pending"}', '{"reason": null, "status": "done"}', NULL, '2026-08-16 04:22:12.766591+00'),
	('d91f89a2-e3e6-43bb-857e-c4e4095ed4d2', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.finalize', 'order', '21029d13-dbf7-46ca-9da3-86f039f63fba', NULL, '{"tax": 0.00, "total": 536.00, "discount": 134.00, "subtotal": 670.00, "invoice_no": "INV-2026-000001", "paid_amount": 0.00, "payment_method": "cash", "payment_status": "unpaid"}', NULL, '2026-08-16 04:54:12.789368+00'),
	('aa8557b7-e7d8-4cec-8a24-df740172db7b', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', '{"status": "pending"}', '{"reason": null, "status": "preparing"}', NULL, '2026-08-16 04:59:27.423312+00'),
	('0e8a8248-71d3-478b-83ef-01af886ef67d', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', '{"status": "preparing"}', '{"reason": null, "status": "done"}', NULL, '2026-08-16 04:59:29.45843+00'),
	('0eeebfb4-906a-4cc9-8c20-e58da929dae5', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.finalize', 'order', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', NULL, '{"tax": 0.00, "total": 1152.00, "discount": 288.00, "subtotal": 1440.00, "invoice_no": "INV-2026-000002", "paid_amount": 0.00, "payment_method": "upi", "payment_status": "unpaid"}', NULL, '2026-08-16 04:59:46.78832+00'),
	('b12bfdd4-0879-4661-89b2-78151647a5cb', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.finalize', 'order', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', NULL, '{"tax": 0.00, "total": 1152.00, "discount": 288.00, "subtotal": 1440.00, "invoice_no": "INV-2026-000002", "paid_amount": 0.00, "payment_method": "upi", "payment_status": "unpaid"}', NULL, '2026-08-16 05:00:23.761862+00'),
	('44f6cdcf-4e40-4f87-a1de-64585fbb2512', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '1367b075-7618-4588-8cad-873edc04d4e9', '{"status": "pending"}', '{"reason": null, "status": "preparing"}', NULL, '2026-08-16 05:17:24.578189+00'),
	('c2c247a5-f7d2-4c6b-bd08-d35c5e2e6a6e', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '1367b075-7618-4588-8cad-873edc04d4e9', '{"status": "preparing"}', '{"reason": null, "status": "done"}', NULL, '2026-08-16 05:17:26.681717+00'),
	('a0fb7bc9-47a8-4364-a1e0-67a590be7dc7', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.finalize', 'order', '1367b075-7618-4588-8cad-873edc04d4e9', NULL, '{"tax": 0.00, "total": 960.00, "discount": 240.00, "subtotal": 1200.00, "invoice_no": "INV-2026-000004", "paid_amount": 0.00, "payment_method": "cash", "payment_status": "unpaid"}', NULL, '2026-08-16 05:17:40.085988+00'),
	('a1566dcf-f0af-4b6d-aedc-51192ee81489', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.finalize', 'order', '1367b075-7618-4588-8cad-873edc04d4e9', NULL, '{"tax": 0.00, "total": 960.00, "discount": 240.00, "subtotal": 1200.00, "invoice_no": "INV-2026-000004", "paid_amount": 0.00, "payment_method": "cash", "payment_status": "unpaid"}', NULL, '2026-08-16 06:18:08.26011+00'),
	('5ab6c7ca-79ac-4242-915f-3c05b4eecaab', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', 'f57a6d18-a75d-415d-adf9-9af144240481', '{"status": "pending"}', '{"reason": null, "status": "preparing"}', NULL, '2026-08-16 06:20:59.975326+00'),
	('b3b4a777-2be1-4287-9bdb-ac62a3395421', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', 'f57a6d18-a75d-415d-adf9-9af144240481', '{"status": "preparing"}', '{"reason": null, "status": "done"}', NULL, '2026-08-16 06:21:02.105121+00'),
	('838c07c6-3358-4806-8122-4b0633d28a36', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '9b15d3bc-76f9-4356-a396-3c7164e024a8', '{"status": "pending"}', '{"reason": null, "status": "done"}', NULL, '2026-08-16 06:45:56.780282+00'),
	('9b7c698c-ce3c-4965-a1c2-9c01d57c214d', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '75a0678a-6ca2-46b9-9e48-0ee91715650e', 'order.status_change', 'order', '117c4166-5b55-4685-9ec7-f1f8562cc9b1', '{"status": "pending"}', '{"reason": null, "status": "done"}', NULL, '2026-08-16 07:53:09.988354+00');


--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."inventory" ("id", "name", "quantity", "unit", "restaurant_id", "category", "supplier", "min_stock", "sku", "cost_price", "expiry_date", "notes", "created_at") VALUES
	('16d35d8c-778f-4652-92e0-c92afeda31a5', 'Tomato', 6, 'kg', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Vegetables', 'Ram singh', 0, 'XQPO3C', 300, '2026-07-26', '', '2026-07-19 09:31:00.351+00'),
	('1244631d-3e97-4dee-8c2f-32e4cff3341c', 'toamto', 20, 'kg', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Vegetables', 'Alam', 0, 'K898EZ', 1200, '2026-07-26', '', '2026-07-19 11:13:17.784+00'),
	('6cb74aa2-fda2-45d8-ba17-598384812f2d', 'pyaz', 1, 'kg', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Vegetables', 'yyyy', 0, 'QU2155', 600, '2026-08-02', '', '2026-07-26 20:47:05.54+00'),
	('cdd1969e-6636-4755-91fa-9497ed5ed173', 'pyaz', 1, 'kg', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Vegetables', 'yyyy', 0, '9ORU5I', 600, '2026-08-02', '', '2026-07-26 20:47:05.76+00');


--
-- Data for Name: inventory_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: invoice_sequences; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."invoice_sequences" ("restaurant_id", "next_number", "updated_at") VALUES
	('b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 6, '2026-08-16 06:18:08.26011+00');


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."menu_items" ("id", "name", "price", "category", "restaurant_id", "image", "description") VALUES
	('89fd4bc2-35af-450b-80c2-1504c19c3e48', 'Chowmin', 150, 'Chinese', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1775026002661.jpg', NULL),
	('3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 'Fried Rice', 150, 'Chinese', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1775026023134.jpg', NULL),
	('5d3473bc-94ce-418a-b636-d1a882e7c20e', 'Samosa', 30, 'Snacks', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1775026088754.jpg', NULL),
	('51572150-a5d6-4b70-bba0-75f0cd4d1587', 'Shahi Paneer ', 320, 'Indian', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1775026113097.jpg', NULL),
	('33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 'Prantha ', 140, 'Indian', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1775026129059.jpg', NULL),
	('a989b11c-ca76-48d0-9c81-c41c2695ea7a', 'Kadai Paneer', 320, 'Indian', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1775026152840.jpeg', NULL),
	('db1e955e-b248-4812-aef8-842ad1877da1', ' Spinach Sandwich', 189, 'Sandwich', '8118f344-f928-42b8-950d-7910fd7f09d4', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/item-1776085855324.jpg', NULL),
	('ff224247-da59-4504-ad77-39aa6cedbff7', 'Aloo Chaat ', 190, 'Chaat', '8118f344-f928-42b8-950d-7910fd7f09d4', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1776085998278.jpg', NULL),
	('2d69bb1e-6c5c-44df-bd06-96468a5eb34b', 'Chai', 89, 'Hot Beverage', '8118f344-f928-42b8-950d-7910fd7f09d4', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1776086055710.webp', NULL),
	('24286df1-f8a6-4bf4-ae4e-09da11c32744', 'Paneer Bhurzi', 350, 'Indian', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/menu-images/menu-1775026056055.jpg', 'एक बेहद लोकप्रिय और मसालेदार भारतीय व्यंजन है, जिसे ताज़े भुने हुए मसालों, पनीर, शिमला मिर्च और प्याज़ के टुकड़ों के साथ गाढ़ी टमाटर की ग्रेवी में पकाया जाता है');


--
-- Data for Name: item_ingredients; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: offers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."offers" ("id", "title", "discount", "description", "valid_till", "created_at", "restaurant_id", "valid_from", "active", "min_order", "discount_type") VALUES
	('3aa6c7fa-2379-41a4-900b-500880d30f74', 'Rakhi Special', 26, 'Rakhi Dhamaka', '2026-08-02', '2026-07-22 12:21:50.146288', '8118f344-f928-42b8-950d-7910fd7f09d4', '2026-08-15', true, 0.00, 'percent'),
	('52c4a9c9-41f2-4453-975c-763f7082f050', 'Rakhi special', 20, 'Rakhi Special Discount', '2026-08-29', '2026-08-15 15:05:37.237579', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '2026-08-15', true, 6.00, 'percent');


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."orders" ("id", "source_type", "source_id", "status", "created_at", "restaurant_id", "source_label", "overall_note", "subtotal", "discount_amount", "tax_amount", "total_amount", "offer_id", "invoice_no", "payment_status", "payment_method", "paid_amount", "billed_at", "inventory_consumed", "cancelled_at", "cancellation_reason") VALUES
	('527af29f-5bbf-45bf-9122-371a747729ed', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-03-30 09:05:28.631397', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('f819a1e4-00aa-4a45-881d-2475fa87db48', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-03-30 09:11:11.569463', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('77bbebea-32b4-4e08-829c-09529bf2ee89', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-04-07 18:13:27.211548', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('345616a4-7dc2-4a5a-8af2-dabe08680fad', 'room', '4ac260eb-3d77-46da-a410-d5c0f300aa96', 'done', '2026-04-12 11:17:48.434051', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 303', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('d471a9f2-d0ba-4aa6-b70d-8d9fdea2ea14', 'table', '2c6f2fff-b649-4570-b635-113fc30f0f0b', 'done', '2026-04-07 18:27:06.760808', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 9', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('4e8d192a-bdd3-4e9a-88f4-1c866755ef7a', 'table', '816a2d4a-1d69-4f5b-8799-68fc626ccde4', 'done', '2026-04-01 08:32:22.93609', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('b6792b7e-7adf-4d03-9ee0-ecbd63384621', 'table', '270c2565-aa8a-4117-a030-1ae1dab75728', 'done', '2026-04-12 11:36:23.705021', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 1', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('44e7527a-7d45-4f40-845c-6f056de4b859', 'table', 'fbd5f831-94e0-4e92-b4d3-b5876964d4b1', 'done', '2026-04-01 10:26:39.707025', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 8', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('5dcbdbae-ffaa-4afb-8362-f946386f291a', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-03-31 21:38:36.79111', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('0b743f81-d564-46b5-aace-bb2375bdd360', 'room', '2b65da29-a908-48e5-a551-ea18b1d79663', 'done', '2026-04-02 15:00:52.86344', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 401', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('8e3e521e-95f5-40a6-a359-edeed5938add', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-04-02 08:25:02.986401', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('90f12858-8ea0-449c-9aa2-7c1b1b3d6cec', 'room', 'd8d13814-e134-4780-a225-693f22402c61', 'done', '2026-03-31 21:50:15.738665', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 103', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('ba1b3437-dc95-4c92-b6b1-e4e3ed5bbfc6', 'room', '5ff2ef00-99a5-43f0-a293-2d9464611490', 'done', '2026-03-31 18:49:47.479445', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 201', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('3349b64d-c6a8-41da-9798-cf6f25ab83e0', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-03-31 21:37:45.177646', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('85a1c55f-c6d5-4bf5-a71d-5baef7e83a9b', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-03-31 12:44:39.701182', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('64ab2d0d-4f96-49ba-bb76-ac6d8522b6a3', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-03-31 12:16:44.984713', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('3cfbc260-2332-4660-9ee1-fb2ebda623a6', 'room', '79c70831-99c2-432e-95fa-300c181fd3a1', 'done', '2026-03-31 10:52:24.114668', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 101', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('e7c16fa3-6f63-4912-b672-27c73b11d9b4', 'room', 'f84ed16b-1b1b-410c-9bdd-0789ccb235ce', 'done', '2026-03-31 09:44:08.16216', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 109', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('c5d61be3-c307-46a7-aaaa-0be5f70650e0', 'table', 'a6ce5a4d-a222-489f-a5c5-aebaa15201f0', 'done', '2026-03-31 15:02:46.154072', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 6', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('7fe5e2e7-0875-4c76-8cef-8b6db8109e9c', 'table', '270c2565-aa8a-4117-a030-1ae1dab75728', 'done', '2026-03-31 05:07:27.224717', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 1', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('edb0c770-73f2-44ff-a85d-e81bdb0aa06c', 'table', 'db108c64-ea69-4e56-ae79-b1c3147aa724', 'done', '2026-03-31 16:32:00.734744', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('63c8d878-ae85-49e1-a268-209c6d222904', 'table', 'b87eaddf-63b1-4c66-8393-c2b2ba723259', 'done', '2026-04-12 11:36:58.405908', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 46', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('b48d9eb3-ba1e-45af-aa1a-a96db8a29942', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-03-31 05:02:49.487565', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('06d79d0c-4c16-429f-8c1b-7da16a9f0399', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-03-30 09:59:04.762343', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('fe724952-99aa-4181-9531-974323577de4', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-03-30 09:18:56.434961', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('99b667dd-b678-415b-b105-e51c10eab527', 'table', 'f58327b1-25aa-4256-a1ec-75eb6d1f156d', 'done', '2026-03-30 09:12:42.941574', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 7', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('46097bb0-f1ef-441e-bda4-576b19be13f4', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-03-29 22:56:37.410739', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('2ed86068-b587-444d-ae66-6a3eeee3fd12', 'table', 'a6ce5a4d-a222-489f-a5c5-aebaa15201f0', 'done', '2026-03-29 23:47:02.379982', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 6', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('7f43e24f-8805-4b38-9a49-086882fbb40d', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-04-12 12:50:54.974788', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('6394bdbd-fe3f-48d4-a7bc-9b27e3c1b04a', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-04-02 08:25:06.495416', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('15ee3108-7586-4935-ae71-87765087009a', 'table', 'db108c64-ea69-4e56-ae79-b1c3147aa724', 'done', '2026-04-12 11:12:33.180219', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('e58bc14a-8c2c-4e6c-b837-65285e62653c', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-04-12 12:53:34.486014', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('4773a31b-76ba-454e-a785-0fc0c2b9e721', 'room', '9ce25ffe-335a-44ef-abae-e33d902c65c8', 'done', '2026-04-12 11:14:47.487636', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Room 101', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('ee13b862-4688-4e11-b0cb-5fdc3aa2c794', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-12 12:56:37.652114', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('b61c8382-2cee-40d2-9680-e4d27144a17a', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-04-13 09:06:57.255626', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('835d6091-dc24-4048-a71a-e5926489c5db', 'table', '270c2565-aa8a-4117-a030-1ae1dab75728', 'done', '2026-04-13 12:29:16.736688', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 1', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('c87d717f-5e10-43dc-a525-4f334c66242c', 'room', '79c70831-99c2-432e-95fa-300c181fd3a1', 'done', '2026-04-13 12:26:40.974314', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 101', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('ad22ceee-07af-463c-ad6d-f387ac56b06f', 'table', '270c2565-aa8a-4117-a030-1ae1dab75728', 'done', '2026-04-13 12:25:08.81518', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 1', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('21e3d097-fc33-44e2-8a58-e96a76dc32f8', 'table', 'db108c64-ea69-4e56-ae79-b1c3147aa724', 'done', '2026-04-13 12:20:12.897713', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('133ce38e-ed7b-46c0-a912-6c8c7e0f110a', 'room', '79c70831-99c2-432e-95fa-300c181fd3a1', 'done', '2026-04-13 11:16:48.354628', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 101', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('7132da09-d19c-41bd-917b-e9e3a3725ee2', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-04-13 11:16:38.02679', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('904ed9e6-5fab-4d17-9d61-ef855576ec43', 'room', '79c70831-99c2-432e-95fa-300c181fd3a1', 'done', '2026-04-13 09:44:16.261218', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 101', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('43176799-76ef-465b-b877-35344efaf670', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-04-13 09:44:05.083008', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('25d9f519-97db-4dee-9be8-03d145d57dcb', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-04-13 09:43:00.043717', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('9874e652-9564-4999-92af-0ca069014806', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-04-13 06:10:34.149907', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('fe661716-8095-429c-badd-fba6fcb52b54', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-04-12 16:23:08.228196', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('e4eb2c4a-938b-4d6a-a3bc-e3cc68507b88', 'table', '816a2d4a-1d69-4f5b-8799-68fc626ccde4', 'done', '2026-04-12 10:29:42.720769', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('ef368f78-3cb0-481e-9db3-d694a747c4b0', 'table', '1cfe3a88-1633-4509-8011-d6c276ac9d2c', 'done', '2026-04-12 10:23:28.647768', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 1', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('f461bda0-e0f7-48c9-a1e0-d19797634e6b', 'table', '1cfe3a88-1633-4509-8011-d6c276ac9d2c', 'done', '2026-04-12 10:04:00.88959', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 1', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('721da777-1325-4b9c-bd55-97275588edc3', 'room', '9313306b-7380-4c30-9926-ddefd819af1d', 'done', '2026-04-12 09:42:25.531735', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Room 102', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('90e4925f-a32d-4176-8cff-366c43566095', 'table', '816a2d4a-1d69-4f5b-8799-68fc626ccde4', 'done', '2026-04-11 22:58:20.514298', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('c1dfcd78-0503-4df7-8d35-c763f8ec9e33', 'room', '9ce25ffe-335a-44ef-abae-e33d902c65c8', 'done', '2026-04-11 22:22:34.656445', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Room 101', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('5f73ba47-b96b-4458-b6dd-05a850434a0a', 'table', 'db108c64-ea69-4e56-ae79-b1c3147aa724', 'done', '2026-04-11 22:22:15.013766', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('6dd4eaaa-4123-4c8d-b6bf-a825fe837366', 'room', '9313306b-7380-4c30-9926-ddefd819af1d', 'done', '2026-04-11 21:32:16.988076', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Room 102', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('d430d33e-a9c2-4346-846f-12bef8bd77bc', 'room', '9313306b-7380-4c30-9926-ddefd819af1d', 'done', '2026-04-11 19:20:45.695896', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Room 102', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('2ea6e73f-5e27-4d1e-8272-727cf37162a7', 'table', 'de4f2a0f-7abb-454b-b55a-273abb12623f', 'done', '2026-04-07 21:04:16.134191', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 140', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('dd5e6bc4-6dd3-4f27-93ab-1ab4658784e4', 'table', '816a2d4a-1d69-4f5b-8799-68fc626ccde4', 'done', '2026-04-13 12:30:32.438387', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('354a9d3c-ebca-4d64-9e05-b110c353dd63', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-13 13:47:59.410425', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('4ace3f84-dc1f-40cd-a830-6e82cc9c0de3', 'table', 'de4f2a0f-7abb-454b-b55a-273abb12623f', 'done', '2026-04-15 08:37:08.131797', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 140', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('9eb5bfa8-4673-4070-a54c-936d51238c62', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-06-23 18:28:59.95904', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('8c0ee5be-98e7-4c82-833b-966c8e8a456e', 'table', 'de4f2a0f-7abb-454b-b55a-273abb12623f', 'done', '2026-04-15 08:39:45.110717', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 140', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('5c895027-e599-4cd9-82be-7e969b0c422e', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-14 09:51:28.863659', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('4435addc-c2f9-4f56-ab02-9a94120f49e8', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-07-15 13:09:14.983046', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('c56b68a4-dd9a-4a13-b8a7-b72b9508c91b', 'table', 'de4f2a0f-7abb-454b-b55a-273abb12623f', 'done', '2026-04-13 13:03:33.572487', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 140', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('014b81ed-af10-4d96-9032-3de45d41c456', 'room', '1c5b78fb-edab-4daa-a6f2-23d743e07466', 'done', '2026-04-13 13:49:58.917746', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Room 103', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('2d1e16d1-d996-4a0d-ba36-970ba185b99b', 'room', '1c5b78fb-edab-4daa-a6f2-23d743e07466', 'done', '2026-04-13 13:07:16.654816', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Room 103', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('ec8c4537-487f-40d5-a192-3f5473e14e4e', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-04-13 16:10:45.932116', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('f2098028-d443-4722-beea-5074712420bf', 'room', '4238ec7b-bf25-4ab4-ae56-7de5a8de288f', 'done', '2026-04-15 19:27:31.34864', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 102', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('a55e4026-066f-4e54-b51d-16f15e72229e', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-14 13:50:29.155003', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('f11738fb-f573-45b2-aa69-05fbc1cdecaa', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-17 10:56:57.044609', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('8bfb63da-6103-4015-9559-a91b1ea33cd0', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-17 17:38:13.615857', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('a70d98ee-179a-477e-bfb4-cfc38351c5f3', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-07-14 20:53:46.490264', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('ba50be1f-9d8c-40c0-82da-a982558498fb', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-14 13:37:28.565092', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('b9de0e4a-33ab-4a70-9852-5cc1543cfdb3', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-19 12:42:35.700778', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('48d1b349-4dac-49f1-b498-7dcc404df033', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-14 13:29:45.515649', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('168ef446-1ac5-4acd-a9bb-2474cd91d947', 'room', 'd8d13814-e134-4780-a225-693f22402c61', 'done', '2026-06-23 18:21:25.409078', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 103', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('9c4474b6-bef9-42ab-91cb-5f6ba0f68f6f', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-06-23 18:22:45.720301', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('1dc4ff0f-2232-44fc-b639-b918a9c8915c', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-14 09:50:44.0861', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('d0630165-6aba-4707-b0e3-37e6a34c96f1', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-13 19:00:31.903343', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('2d886411-3305-4527-be42-d8e35e5fdb56', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-06-23 18:26:10.017518', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('58179cc2-33d0-41f2-bae9-900b0d75b8da', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-06-23 17:56:27.440599', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('3efb5852-4430-4ef8-9851-f81579ce2cfb', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-06-23 17:55:39.896634', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('10f17f50-d6c9-4480-ab61-c05011336ebf', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-05-19 15:08:42.052448', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('81db5dd9-2f17-4b13-aee0-9e38d15823cb', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-05-15 12:28:15.805529', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('cd13d959-da9a-47f3-b1f1-386840f12b82', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-19 12:42:32.612401', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('f79ad15a-a37d-4f81-bca2-4b32014c8aa7', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-19 08:48:25.869027', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('fef6a4fa-0e9a-4b6a-a3fc-647dfcebbebf', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-19 08:48:05.614409', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('be6193cb-7c3a-4698-bb62-567f4b0923a8', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-04-19 08:47:49.78487', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('f841674c-5f2d-4dfb-aeba-a58f3228fa5a', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-04-14 14:02:14.921928', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('28a87c17-b8ad-4372-a47e-beae527123d4', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-04-14 14:02:36.457022', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('59adf942-4e9d-48c5-b45d-45f1b3819217', 'room', 'd8d13814-e134-4780-a225-693f22402c61', 'done', '2026-07-16 10:04:58.86306', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 103', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('fbeb7025-caa8-4e6d-9181-9592076c79d4', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-15 15:30:47.047518', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('b2f44b76-7de6-4598-ac55-0d3fc405f286', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-17 14:40:39.727796', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', 'Botle le kar aana', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('f5cddecc-795a-4ceb-aeef-49c856907ba8', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-15 15:36:28.418871', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('5cfb1e39-c5a7-48a7-8432-2bb304365c29', 'room', 'f84ed16b-1b1b-410c-9bdd-0789ccb235ce', 'pending', '2026-07-16 09:50:30.180962', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 109', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('e59128ea-1762-4909-a21f-1c1f06b69e3e', 'table', '5bfb9c6f-7400-4118-942a-0fd3d7589df5', 'done', '2026-07-14 23:23:00.813461', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 3', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('4d6027d3-09de-48af-84a4-4baa2f63ed43', 'room', 'd8d13814-e134-4780-a225-693f22402c61', 'pending', '2026-07-15 00:06:35.887264', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 103', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('7846aa02-1003-4e2e-881b-732c0d595a05', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'pending', '2026-07-15 00:11:18.893791', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('5ab23831-3c49-4d60-ad05-37e40be25171', 'room', 'f84ed16b-1b1b-410c-9bdd-0789ccb235ce', 'pending', '2026-07-15 00:57:06.160635', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 109', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('ccb6d79f-8bc9-48ac-8d80-860fcf666082', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'done', '2026-07-15 10:03:58.364776', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('8a7679a3-838d-4841-b8cc-e4672bd30c6a', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'pending', '2026-07-18 08:35:16.11061', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', 'Mujhe pani ki bottle aur daru ki bottle bhi lana', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('3f4828bb-f5ab-4e6b-8b09-5e6e7f31511b', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-16 10:01:16.268541', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('dd5efc65-8e42-4ad7-b631-1adc351581bc', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-07-19 13:16:09.523508', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', 'Pani ki bottle or daru ki bottle lana', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('daa01d26-d7bc-4b76-9515-d70c4f45a60f', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-18 13:23:20.658615', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', '', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('6b72c37e-3e90-4f9b-a856-02f6c23a6e6d', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-07-18 16:45:34.316047', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', '', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('b015ebe7-c1b6-4fb1-9740-a7f2c438df31', 'table', '31820cc0-7b50-46b3-89a1-1b64d6b66631', 'pending', '2026-07-20 13:59:21.628672', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 2', 'Indri', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('4ec56754-76d5-40c0-a857-337cd403f209', 'room', '4238ec7b-bf25-4ab4-ae56-7de5a8de288f', 'done', '2026-07-21 05:23:00.613494', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Room 102', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('3e5972d9-82db-404b-a89b-bb047ebc6975', 'table', 'db108c64-ea69-4e56-ae79-b1c3147aa724', 'done', '2026-07-22 12:32:10.424054', '8118f344-f928-42b8-950d-7910fd7f09d4', 'Table 2', '', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('9133baa3-bde1-430b-949a-dc71e762bdc4', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'pending', '2026-07-30 11:26:07.561148', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', '', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('5aaec7bf-4e15-49c3-88d9-62d21578962f', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-09 10:19:13.831508', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', 'Pani ki bottle, daru ki bottle', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('522e2366-840c-47fb-9169-8da04672bdbc', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-11 11:50:12.934244', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', '', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('a362bb68-1701-4a88-aae9-9c6283a364f5', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-15 14:19:08.956829', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', 'Pani ki bottle bhi lana', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('354b451d-05bd-439c-b333-c6266d8c02d1', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-15 14:43:33.748534', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', 'Plate bhi lana extra', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('9c8d2eea-6f5c-4a55-bd88-62ac2e9a68ab', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-08-15 14:57:44.664125', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', 'Plate chaiye extra', 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('bfad9ef6-cd8d-4f65-97dc-e614655c4fd0', 'table', '87b8e577-7260-455d-a8bf-3970f3e99704', 'done', '2026-08-15 15:03:17.944892', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 5', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('8cce6088-ec4f-4393-a615-994715d2b687', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'pending', '2026-08-15 15:05:51.47474', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 0.00, 0.00, 0.00, 0.00, NULL, NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('be59b3a2-a275-4899-be8a-c4d88d5525c1', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-15 15:47:07.943425', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 500.00, 100.00, 0.00, 400.00, '52c4a9c9-41f2-4453-975c-763f7082f050', NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('117c4166-5b55-4685-9ec7-f1f8562cc9b1', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-16 07:52:48.724441', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 670.00, 134.00, 0.00, 536.00, '52c4a9c9-41f2-4453-975c-763f7082f050', NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('21029d13-dbf7-46ca-9da3-86f039f63fba', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-16 04:21:45.774261', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 670.00, 134.00, 0.00, 536.00, '52c4a9c9-41f2-4453-975c-763f7082f050', 'INV-2026-000001', 'unpaid', 'cash', 0.00, '2026-08-16 04:54:12.789368+00', true, NULL, NULL),
	('1df1892b-47d3-4094-b2a0-abbbd2d228e8', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-16 04:58:52.804971', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 1440.00, 288.00, 0.00, 1152.00, '52c4a9c9-41f2-4453-975c-763f7082f050', 'INV-2026-000002', 'unpaid', 'upi', 0.00, '2026-08-16 04:59:46.78832+00', true, NULL, NULL),
	('1367b075-7618-4588-8cad-873edc04d4e9', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-16 05:17:11.184225', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 1200.00, 240.00, 0.00, 960.00, '52c4a9c9-41f2-4453-975c-763f7082f050', 'INV-2026-000004', 'unpaid', 'cash', 0.00, '2026-08-16 05:17:40.085988+00', true, NULL, NULL),
	('f57a6d18-a75d-415d-adf9-9af144240481', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-16 06:20:27.276899', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 650.00, 130.00, 0.00, 520.00, '52c4a9c9-41f2-4453-975c-763f7082f050', NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('9b15d3bc-76f9-4356-a396-3c7164e024a8', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'done', '2026-08-16 06:45:39.559771', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 900.00, 180.00, 0.00, 720.00, '52c4a9c9-41f2-4453-975c-763f7082f050', NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL),
	('b5131d46-ccd4-44e0-a96d-2beea71ccb19', 'table', '849ad571-81aa-46a2-a576-538d96afec90', 'pending', '2026-08-16 07:52:39.845216', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'Table 4', NULL, 670.00, 134.00, 0.00, 536.00, '52c4a9c9-41f2-4453-975c-763f7082f050', NULL, 'unpaid', NULL, 0.00, NULL, false, NULL, NULL);


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."order_items" ("id", "order_id", "item_id", "quantity", "cooking_request", "item_name", "unit_price", "line_total") VALUES
	('51395129-f91d-439e-babd-c8a7605c63c4', '64ab2d0d-4f96-49ba-bb76-ac6d8522b6a3', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('47593034-7a1c-487a-b245-9c98e46e98ad', '85a1c55f-c6d5-4bf5-a71d-5baef7e83a9b', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('bb6b6b6f-0851-40b9-ad8c-ddf2f36e7719', 'c5d61be3-c307-46a7-aaaa-0be5f70650e0', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('d90fd132-477f-4655-af70-b6f46109469e', 'c5d61be3-c307-46a7-aaaa-0be5f70650e0', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('c1dc9d35-b0b2-4ca0-856d-0e331c7c8fea', 'ba1b3437-dc95-4c92-b6b1-e4e3ed5bbfc6', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('7cad670e-0f3c-4620-bfbd-21e1dae83b67', 'ba1b3437-dc95-4c92-b6b1-e4e3ed5bbfc6', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('339f0352-5a37-4877-b5e8-d9c10281ba17', 'ba1b3437-dc95-4c92-b6b1-e4e3ed5bbfc6', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('65a818c1-d4ca-4e5c-becf-d030a0b1f8ca', 'ba1b3437-dc95-4c92-b6b1-e4e3ed5bbfc6', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('fb221403-0018-4c0f-9d77-09db9ecde830', 'ba1b3437-dc95-4c92-b6b1-e4e3ed5bbfc6', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('cb0fe34f-c03a-44d1-b09d-c9b90fb215a2', '3349b64d-c6a8-41da-9798-cf6f25ab83e0', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('45642f84-4e00-40b7-88d0-bf58629e5599', '3349b64d-c6a8-41da-9798-cf6f25ab83e0', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('c5da6447-2e64-415d-a616-6a9caad020fb', '5dcbdbae-ffaa-4afb-8362-f946386f291a', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('0977d108-1084-49a7-b75c-98d78f1274e7', '5dcbdbae-ffaa-4afb-8362-f946386f291a', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('cb8ce16e-ddac-4761-b5fb-b7e38f88e884', '5dcbdbae-ffaa-4afb-8362-f946386f291a', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('635d1b5f-9f3d-4a49-a9a3-9920941af042', '5dcbdbae-ffaa-4afb-8362-f946386f291a', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('a2e92be5-eced-4af5-9916-4bc38b15131d', '90f12858-8ea0-449c-9aa2-7c1b1b3d6cec', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('4b8f367a-569a-42ac-91da-87d23cd8558b', '90f12858-8ea0-449c-9aa2-7c1b1b3d6cec', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('5cdf9b72-bccc-41ec-9caa-13b4f00380f8', '90f12858-8ea0-449c-9aa2-7c1b1b3d6cec', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('509aab5b-d614-4669-b2ef-7bae4546f16e', '4e8d192a-bdd3-4e9a-88f4-1c866755ef7a', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('156017ba-1316-4f22-9e7a-e0bccee78e00', '44e7527a-7d45-4f40-845c-6f056de4b859', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('8e4b2d08-6e39-428d-9a49-63dbf7f28fe9', '44e7527a-7d45-4f40-845c-6f056de4b859', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('9718b52c-5a0e-4533-98e2-56e949c20722', '44e7527a-7d45-4f40-845c-6f056de4b859', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('294370b1-c89e-4ef4-a4f7-cc558c3860e5', '44e7527a-7d45-4f40-845c-6f056de4b859', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('764c802c-0832-4439-8066-b5826414c32b', '44e7527a-7d45-4f40-845c-6f056de4b859', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('ed634b5c-be47-4be5-a38c-b63251001a10', '44e7527a-7d45-4f40-845c-6f056de4b859', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('56168144-6cea-4de2-9cbf-37a354184266', '8e3e521e-95f5-40a6-a359-edeed5938add', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('3e5be902-4412-400c-a2e4-932d521b890d', '8e3e521e-95f5-40a6-a359-edeed5938add', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('82cd0fee-17af-4f4f-b1ba-a2a795cfee50', '8e3e521e-95f5-40a6-a359-edeed5938add', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('167bed7c-03ac-4d6f-b906-a04afd287872', '8e3e521e-95f5-40a6-a359-edeed5938add', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('f8bac9e9-32c2-48c0-8a04-1de8d3e34ad3', '6394bdbd-fe3f-48d4-a7bc-9b27e3c1b04a', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('f20f8688-e0f9-45e2-a898-8f4a9f5ea9da', '6394bdbd-fe3f-48d4-a7bc-9b27e3c1b04a', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('64db08e5-c63c-4431-9f83-45f57c027f03', '6394bdbd-fe3f-48d4-a7bc-9b27e3c1b04a', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('72a34ab1-b99c-469c-90a3-b09f0930731b', '6394bdbd-fe3f-48d4-a7bc-9b27e3c1b04a', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('93bf2b32-f433-4f48-9122-8b459c3e116c', '0b743f81-d564-46b5-aace-bb2375bdd360', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('d4289470-f155-4efa-a674-9ed2eba3f81f', '0b743f81-d564-46b5-aace-bb2375bdd360', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('0057717c-73c6-4041-bfc6-704f72d0264a', '0b743f81-d564-46b5-aace-bb2375bdd360', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('236af81d-5370-4994-b535-ac754013ddc9', '0b743f81-d564-46b5-aace-bb2375bdd360', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('e2d0caeb-1f82-4148-939d-16ab614f60e1', '527af29f-5bbf-45bf-9122-371a747729ed', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('7d3d600a-d035-404a-80e6-1ac30e6f00f9', '527af29f-5bbf-45bf-9122-371a747729ed', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('5c86aec1-e0c7-4ef6-8293-1e05d7acc9e5', '0b743f81-d564-46b5-aace-bb2375bdd360', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('67301263-5d6d-4d72-9c9a-a033d4959d60', '0b743f81-d564-46b5-aace-bb2375bdd360', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('da432d92-acda-4628-b3b4-b0de773f8830', '99b667dd-b678-415b-b105-e51c10eab527', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('8bcadd5c-1b45-46b2-ac57-b0e2de9e35ea', '99b667dd-b678-415b-b105-e51c10eab527', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('711d3bc6-0bd1-4b2f-b404-9058e6cdcec3', '77bbebea-32b4-4e08-829c-09529bf2ee89', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('268af405-e46c-4d95-82be-3348d27764e6', 'fe724952-99aa-4181-9531-974323577de4', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('b5aff93a-f5e6-4098-ac85-0c35b01275cc', '77bbebea-32b4-4e08-829c-09529bf2ee89', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('17929ddf-241b-4b3d-87b1-366a9ae67a78', 'b48d9eb3-ba1e-45af-aa1a-a96db8a29942', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('9fa4c87b-639d-4b9a-95bb-8c9b74582c79', 'd471a9f2-d0ba-4aa6-b70d-8d9fdea2ea14', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('a13785a9-9288-4c38-9c92-8f34b98fac7d', 'd471a9f2-d0ba-4aa6-b70d-8d9fdea2ea14', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('cfb0fafa-6979-4c99-87fc-510ff063ab79', '2ea6e73f-5e27-4d1e-8272-727cf37162a7', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('7fb15aac-7ae7-41f0-b6ac-595366edb353', '2ea6e73f-5e27-4d1e-8272-727cf37162a7', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('7e7cefe6-b67a-4220-9d7f-fe357bfade64', '2ea6e73f-5e27-4d1e-8272-727cf37162a7', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('fc17c6b5-0e13-4818-b1e5-94e54c5a651c', '2ea6e73f-5e27-4d1e-8272-727cf37162a7', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('2191e860-1466-41d5-9759-c0556928efc1', 'd430d33e-a9c2-4346-846f-12bef8bd77bc', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('05145dc1-6963-4c5d-9af8-b38ec360e9f5', '6dd4eaaa-4123-4c8d-b6bf-a825fe837366', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('4b00d2f0-15d1-4c5d-ae4f-d943368bf88e', '5f73ba47-b96b-4458-b6dd-05a850434a0a', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('44c1bf19-22ec-43a4-a404-5c4ec76daf68', 'c1dfcd78-0503-4df7-8d35-c763f8ec9e33', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('5fed5252-78a3-45f7-a550-74257f93b2c8', '90e4925f-a32d-4176-8cff-366c43566095', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('19819329-47fb-40f1-8465-d27d691fb821', 'f461bda0-e0f7-48c9-a1e0-d19797634e6b', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('760a25ce-c068-44c5-ab45-cc099c6b02cd', 'ef368f78-3cb0-481e-9db3-d694a747c4b0', 'ff224247-da59-4504-ad77-39aa6cedbff7', 2, NULL, NULL, NULL, NULL),
	('67957140-5684-453d-a22a-e768e92be321', 'e4eb2c4a-938b-4d6a-a3bc-e3cc68507b88', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('087b43a7-9dd5-4a58-8b3a-7931f43511a3', '15ee3108-7586-4935-ae71-87765087009a', 'ff224247-da59-4504-ad77-39aa6cedbff7', 4, NULL, NULL, NULL, NULL),
	('359a2d14-84b8-42de-ac1d-24484c950ef9', '4773a31b-76ba-454e-a785-0fc0c2b9e721', 'ff224247-da59-4504-ad77-39aa6cedbff7', 7, NULL, NULL, NULL, NULL),
	('505aebc3-adc3-4f46-8735-94f7b5ddf3d8', '345616a4-7dc2-4a5a-8af2-dabe08680fad', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('00003613-656c-45b4-ad2e-31db9ee0fb60', '345616a4-7dc2-4a5a-8af2-dabe08680fad', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 4, NULL, NULL, NULL, NULL),
	('3a5daf55-9db1-4e93-a850-6925268c7c0e', 'b6792b7e-7adf-4d03-9ee0-ecbd63384621', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('be7b0c16-e879-4390-b839-67e51f8e967b', 'b6792b7e-7adf-4d03-9ee0-ecbd63384621', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('bc78907a-f539-4d51-a5ed-790561773db5', 'b6792b7e-7adf-4d03-9ee0-ecbd63384621', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('d2fc776b-1221-4375-a652-fa972fa7f9cf', '63c8d878-ae85-49e1-a268-209c6d222904', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('e98f7b46-d012-410a-aea1-65e6e768445b', '63c8d878-ae85-49e1-a268-209c6d222904', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 7, NULL, NULL, NULL, NULL),
	('7b9cad6a-ee65-482c-a1b9-06c6b21e8219', '7f43e24f-8805-4b38-9a49-086882fbb40d', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('cd74679d-c98f-4e51-9a33-0980c13ed43c', '7f43e24f-8805-4b38-9a49-086882fbb40d', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('4cdfd595-4ced-455d-9ac6-92cdab5d90a8', '7f43e24f-8805-4b38-9a49-086882fbb40d', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('1173579d-f7eb-488f-9526-c39a5f6ab058', '7f43e24f-8805-4b38-9a49-086882fbb40d', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('9a1b1cb0-4b4d-4a0a-b0c8-d05c644835df', 'e58bc14a-8c2c-4e6c-b837-65285e62653c', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('883ab202-d3d0-4fad-9560-65209ae9e919', 'e58bc14a-8c2c-4e6c-b837-65285e62653c', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('1cf1bbf4-0496-480a-90a6-acf3fd0ebd41', 'e58bc14a-8c2c-4e6c-b837-65285e62653c', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('afbd5eda-5290-4dc0-b252-c7760c3a0624', 'e58bc14a-8c2c-4e6c-b837-65285e62653c', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('c32dad65-872f-4427-ae42-b2597aef2a78', 'ee13b862-4688-4e11-b0cb-5fdc3aa2c794', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 4, NULL, NULL, NULL, NULL),
	('0bc65559-36ce-4557-9302-f41277e2551a', 'ee13b862-4688-4e11-b0cb-5fdc3aa2c794', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('76324f71-0898-45d9-8251-845c1c5805f0', 'ee13b862-4688-4e11-b0cb-5fdc3aa2c794', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('dbff054d-4618-4544-847e-e8612d8a4a7f', 'fe661716-8095-429c-badd-fba6fcb52b54', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('b0497cd0-99af-4a22-8aaf-ad02fc0a15e5', 'fe661716-8095-429c-badd-fba6fcb52b54', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('5c84c537-a8ae-4493-9c4e-6913bd6dada9', 'fe661716-8095-429c-badd-fba6fcb52b54', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('0005d03c-0106-4df3-aa38-ced752aa8628', 'fe661716-8095-429c-badd-fba6fcb52b54', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('a55ef0f8-3739-40e2-b83a-46903e76fe3f', '9874e652-9564-4999-92af-0ca069014806', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('7d4731e2-3d4e-4eb4-98fb-43e92b6ebd00', '9874e652-9564-4999-92af-0ca069014806', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('05d5b101-de88-4158-b398-b759d21a72b7', '9874e652-9564-4999-92af-0ca069014806', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('3247eaa4-b771-4399-a163-9f15ea3a4218', '9874e652-9564-4999-92af-0ca069014806', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('5d8cd35b-7945-4385-928d-7f41298deaa3', 'b61c8382-2cee-40d2-9680-e4d27144a17a', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('07ee85a5-32d0-49b7-be4b-c5df964f083f', 'b61c8382-2cee-40d2-9680-e4d27144a17a', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('1d05eeac-5f3c-443e-9caa-874289ea21d6', 'b61c8382-2cee-40d2-9680-e4d27144a17a', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('9ff9d532-64b6-4427-928d-ea69f8aa38dd', '25d9f519-97db-4dee-9be8-03d145d57dcb', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('9b248fbf-331a-466f-bba1-fc940f45cebc', '25d9f519-97db-4dee-9be8-03d145d57dcb', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('e949025e-f779-423f-b3f4-f5e53f55e0fc', '25d9f519-97db-4dee-9be8-03d145d57dcb', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('6d87f25b-d169-40cf-8970-7017094a9da0', '25d9f519-97db-4dee-9be8-03d145d57dcb', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('f55bf239-976c-42a4-9a5b-5b8ee8a1c93e', '43176799-76ef-465b-b877-35344efaf670', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('c236db23-a6a4-420f-bc8b-983f57fd9c8d', '43176799-76ef-465b-b877-35344efaf670', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('b506fb4a-5e05-4bc4-9a34-df14e3534c5c', '904ed9e6-5fab-4d17-9d61-ef855576ec43', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('57c6b55b-8a02-46f2-bd2a-10c8a779ca5a', '904ed9e6-5fab-4d17-9d61-ef855576ec43', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('267e9901-92b7-4b2e-8d6d-2bad683a33a5', '904ed9e6-5fab-4d17-9d61-ef855576ec43', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('fa006efa-1c4f-4698-a358-02519f37e1ce', '7132da09-d19c-41bd-917b-e9e3a3725ee2', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('2c89a14f-e734-40c3-830e-5602732a78c0', '7132da09-d19c-41bd-917b-e9e3a3725ee2', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('44b60b04-58b5-4e49-9067-bce3063fdbbc', '133ce38e-ed7b-46c0-a912-6c8c7e0f110a', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('49ce1bbb-820f-407c-87e0-442858c440ff', '133ce38e-ed7b-46c0-a912-6c8c7e0f110a', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('f124ef7b-09c2-4566-a5b4-5bb66f79eaa7', '133ce38e-ed7b-46c0-a912-6c8c7e0f110a', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('d85c3611-8985-4b49-932d-820cb805d0eb', '21e3d097-fc33-44e2-8a58-e96a76dc32f8', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('ae57edf2-c614-4a69-88ce-efd597c0e66a', 'ad22ceee-07af-463c-ad6d-f387ac56b06f', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('396b0abd-1f0b-40e0-83db-9f244baece48', 'ad22ceee-07af-463c-ad6d-f387ac56b06f', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('fe3bf425-ce2f-4464-a726-fc85df5d2667', 'ad22ceee-07af-463c-ad6d-f387ac56b06f', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('96b991db-5a3e-4bde-a66a-f6ff239450e4', 'c87d717f-5e10-43dc-a525-4f334c66242c', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('5a5f5d10-7187-4c20-994e-8bdb7bd4696f', 'c87d717f-5e10-43dc-a525-4f334c66242c', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('e76b21ba-4570-4af6-86a0-6a3fc14a22dd', 'c87d717f-5e10-43dc-a525-4f334c66242c', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('7df2321a-084e-4325-9329-a95744cd2e1c', '835d6091-dc24-4048-a71a-e5926489c5db', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('8377a79e-4176-4ae3-9a15-81075204596d', '835d6091-dc24-4048-a71a-e5926489c5db', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('2fe9642d-358c-4dd4-a903-ed48d30a0171', '835d6091-dc24-4048-a71a-e5926489c5db', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('356a0bcb-eb7a-47ad-8414-ef4a012f504c', 'dd5e6bc4-6dd3-4f27-93ab-1ab4658784e4', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('3dc3055b-7cf1-4c07-9d44-777692d109d2', 'c56b68a4-dd9a-4a13-b8a7-b72b9508c91b', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('33a1b839-4b7f-4131-9ddd-5e01355d936b', 'c56b68a4-dd9a-4a13-b8a7-b72b9508c91b', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('5b3c56eb-c1b6-43e8-85c8-62f313256fc8', 'c56b68a4-dd9a-4a13-b8a7-b72b9508c91b', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('9fda0ada-96a8-4fdb-8bc3-5c5211b1b0b9', '2d1e16d1-d996-4a0d-ba36-970ba185b99b', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('d0d2460f-93d1-4d78-a324-63792282317b', '354a9d3c-ebca-4d64-9e05-b110c353dd63', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('7d4cde8e-7304-4f16-a6cc-7ca0a44c1538', '014b81ed-af10-4d96-9032-3de45d41c456', 'db1e955e-b248-4812-aef8-842ad1877da1', 1, NULL, NULL, NULL, NULL),
	('cab4fdd4-8eb1-4d21-959e-41efeabed8e7', '014b81ed-af10-4d96-9032-3de45d41c456', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, NULL, NULL, NULL, NULL),
	('f30102b1-1df5-4c80-8616-7ae0cbaa09c8', '014b81ed-af10-4d96-9032-3de45d41c456', '2d69bb1e-6c5c-44df-bd06-96468a5eb34b', 1, NULL, NULL, NULL, NULL),
	('91fa7429-45b6-442a-a413-fc69ff3dec4a', 'ec8c4537-487f-40d5-a192-3f5473e14e4e', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('9c730086-328f-4704-86ea-f7f87ed91342', 'ec8c4537-487f-40d5-a192-3f5473e14e4e', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('4d172b1a-648b-4add-9c05-9277236c5441', 'ec8c4537-487f-40d5-a192-3f5473e14e4e', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('2711295b-4483-4010-b598-c0aef6efe268', 'f841674c-5f2d-4dfb-aeba-a58f3228fa5a', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('cd2c95b9-3fcb-4108-8907-d68dbeb3801d', '28a87c17-b8ad-4372-a47e-beae527123d4', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('2104e038-b3e5-4f73-9276-7ce21097f136', '28a87c17-b8ad-4372-a47e-beae527123d4', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('da8a2dd2-8c26-44f2-973d-d462dd799ff1', '28a87c17-b8ad-4372-a47e-beae527123d4', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('3ad98cb9-2cec-4de7-a950-3f26823e377b', '4ace3f84-dc1f-40cd-a830-6e82cc9c0de3', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('a4b649ff-28f4-4285-ac17-174baa449535', '4ace3f84-dc1f-40cd-a830-6e82cc9c0de3', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('b2e9985a-74db-422a-98d2-a98b6a7a16c5', '4ace3f84-dc1f-40cd-a830-6e82cc9c0de3', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('a2d6dcdc-6305-404b-88e8-7b6412c12633', '8c0ee5be-98e7-4c82-833b-966c8e8a456e', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('0c2c34eb-dc7e-4cb8-bb49-6c216f202c9c', '8c0ee5be-98e7-4c82-833b-966c8e8a456e', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('539a62fd-0a19-4755-967a-9c42abaa0be1', '8c0ee5be-98e7-4c82-833b-966c8e8a456e', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('e22d1024-40dd-428d-8e7f-a53a8826c8bf', 'f2098028-d443-4722-beea-5074712420bf', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('0a9638b3-fd4c-421e-bc5e-517c830a8a52', 'f2098028-d443-4722-beea-5074712420bf', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('1c3de9d3-32d3-4be3-8a04-cdd13c9269c0', 'f2098028-d443-4722-beea-5074712420bf', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('18ceec5e-0900-4450-8f68-d22ce1456032', 'f2098028-d443-4722-beea-5074712420bf', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('a7c8b8a9-0b0d-4574-958d-87ffa880372a', 'f11738fb-f573-45b2-aa69-05fbc1cdecaa', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('287810cf-fb16-4452-b5f1-8e047ea30f9f', 'f11738fb-f573-45b2-aa69-05fbc1cdecaa', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('b048919c-a641-4ffa-9da3-0b8760070190', '8bfb63da-6103-4015-9559-a91b1ea33cd0', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 2, NULL, NULL, NULL, NULL),
	('f1f347f2-dacf-473c-8948-db44bce74bd8', '8bfb63da-6103-4015-9559-a91b1ea33cd0', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 2, NULL, NULL, NULL, NULL),
	('dd3c50fd-2dbe-494c-8801-83b0ccbe2f1a', '8bfb63da-6103-4015-9559-a91b1ea33cd0', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 2, NULL, NULL, NULL, NULL),
	('7d8580a0-0a7f-4aa4-b03c-87dd5785ba50', '8bfb63da-6103-4015-9559-a91b1ea33cd0', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('22cbd1fb-baa3-4598-a34e-444944148c19', 'be6193cb-7c3a-4698-bb62-567f4b0923a8', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('0df24c82-96b7-4057-9451-3ddaf6bcf7fe', 'fef6a4fa-0e9a-4b6a-a3fc-647dfcebbebf', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('39315d75-3ef7-4f53-bf19-6ef9fc8fbb69', 'f79ad15a-a37d-4f81-bca2-4b32014c8aa7', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 4, NULL, NULL, NULL, NULL),
	('bf057561-37ab-4a56-a9f9-3ee47c636884', 'f79ad15a-a37d-4f81-bca2-4b32014c8aa7', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 4, NULL, NULL, NULL, NULL),
	('a7e185ee-b3be-43fb-be3b-4eb89953e47c', 'f79ad15a-a37d-4f81-bca2-4b32014c8aa7', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('0b0ca1fc-2d09-4e1d-8620-a8e7f3bb019b', 'cd13d959-da9a-47f3-b1f1-386840f12b82', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('4dda529e-01dc-4b1f-98dc-5ea6900c92b5', 'cd13d959-da9a-47f3-b1f1-386840f12b82', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('056e9c1a-6d69-43ec-aab7-74fa587474ec', 'cd13d959-da9a-47f3-b1f1-386840f12b82', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('c7d3b704-e1bb-4e6d-b47b-90326d213355', 'cd13d959-da9a-47f3-b1f1-386840f12b82', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('19aae33a-9e07-4dbb-99a7-ae722f880199', 'cd13d959-da9a-47f3-b1f1-386840f12b82', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('48b9f7a0-c5f9-4903-b2ac-54b6c4b7e354', 'b9de0e4a-33ab-4a70-9852-5cc1543cfdb3', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('8bd90186-ad6f-4f63-9356-6f461115ae03', 'b9de0e4a-33ab-4a70-9852-5cc1543cfdb3', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('7b324183-f291-48cd-ba34-f468b460cd03', 'b9de0e4a-33ab-4a70-9852-5cc1543cfdb3', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('632d7ffc-4fde-4383-96d4-791003297b11', 'b9de0e4a-33ab-4a70-9852-5cc1543cfdb3', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('530591b5-b0d6-4603-beff-62f3f74915fe', 'b9de0e4a-33ab-4a70-9852-5cc1543cfdb3', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('2a33a817-5e9a-49b9-a369-b79ea090b2b5', '81db5dd9-2f17-4b13-aee0-9e38d15823cb', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('40fcb329-152d-4806-ac28-7cf350397c13', '81db5dd9-2f17-4b13-aee0-9e38d15823cb', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('9e362954-2dd8-41a1-8b62-384baff56631', '81db5dd9-2f17-4b13-aee0-9e38d15823cb', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('ff4c7e62-3626-4e3e-a6c9-b8424126730c', '81db5dd9-2f17-4b13-aee0-9e38d15823cb', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('a06d8d37-f5cd-49cc-8586-93d8533a0686', '81db5dd9-2f17-4b13-aee0-9e38d15823cb', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('04703cd8-cd6b-48e8-bb32-e4f46d830dc2', '10f17f50-d6c9-4480-ab61-c05011336ebf', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('320c48b4-1c10-4b96-88d6-867fb79aedaf', '10f17f50-d6c9-4480-ab61-c05011336ebf', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('02b9b691-512d-4132-9ad3-8d7e70726daa', '10f17f50-d6c9-4480-ab61-c05011336ebf', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('e4ce17aa-49e2-40dc-bbb8-4c3499ba16b1', '10f17f50-d6c9-4480-ab61-c05011336ebf', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('f14aba69-f123-447e-b350-6b8602e92a5c', '3efb5852-4430-4ef8-9851-f81579ce2cfb', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('7505acf5-6b2c-4b78-ad01-aacfb4209fdc', '3efb5852-4430-4ef8-9851-f81579ce2cfb', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('6c796653-b1d4-4951-9993-6115d0b28a63', '3efb5852-4430-4ef8-9851-f81579ce2cfb', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('d1694610-9ee4-4e99-8710-118ff5209a10', '3efb5852-4430-4ef8-9851-f81579ce2cfb', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('e9d02d22-2bb4-4fff-9664-0b5f4927d55a', '58179cc2-33d0-41f2-bae9-900b0d75b8da', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('fe633687-e8bd-442f-9113-cbc4e44af3f2', '58179cc2-33d0-41f2-bae9-900b0d75b8da', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('bb2c3a0e-48c2-4820-a593-0fb33b11ab42', '58179cc2-33d0-41f2-bae9-900b0d75b8da', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('85afb24b-3825-4619-8b5f-03f7424e6958', '168ef446-1ac5-4acd-a9bb-2474cd91d947', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('feefedd7-408b-44ff-af1b-13a0e68ac758', '168ef446-1ac5-4acd-a9bb-2474cd91d947', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('ef431678-012d-4a20-a1e9-b8969dcb3101', '168ef446-1ac5-4acd-a9bb-2474cd91d947', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('acf1ff71-0f29-4f75-9c7c-16423607dfad', '9c4474b6-bef9-42ab-91cb-5f6ba0f68f6f', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('6aaf455b-03f3-4626-b7b6-20b92f0075e0', '9c4474b6-bef9-42ab-91cb-5f6ba0f68f6f', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('7a9c8fa2-f44f-486b-ad8f-66f9b51e6631', '9c4474b6-bef9-42ab-91cb-5f6ba0f68f6f', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('5df695fb-598f-4bae-8762-17ddbffe1e4a', '9c4474b6-bef9-42ab-91cb-5f6ba0f68f6f', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('c91afb35-0f0b-4362-a434-d78025e49aa9', '2d886411-3305-4527-be42-d8e35e5fdb56', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('754992df-e1a9-40c1-8cdf-0c053ebf17dc', '2d886411-3305-4527-be42-d8e35e5fdb56', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('8391a03c-c462-498e-ac98-40c4b03d4642', '2d886411-3305-4527-be42-d8e35e5fdb56', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('ca0b162f-65d1-45fc-8f1a-88dca4ce3df1', '9eb5bfa8-4673-4070-a54c-936d51238c62', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('bc638c74-97e1-40f6-9fa8-d48f1c25c583', '9eb5bfa8-4673-4070-a54c-936d51238c62', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('5c85a458-583f-45b8-afda-8b692bc62845', '9eb5bfa8-4673-4070-a54c-936d51238c62', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('60636d04-f427-4005-b263-fefd9b31164b', '9eb5bfa8-4673-4070-a54c-936d51238c62', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('22096c94-c945-41e1-b8b6-04d0aaac4ee1', 'd0630165-6aba-4707-b0e3-37e6a34c96f1', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('ec96a86a-16d6-4a5b-810f-72ddf461ce82', 'd0630165-6aba-4707-b0e3-37e6a34c96f1', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('bc8ac3bc-4564-43fa-add7-34a48c052960', 'd0630165-6aba-4707-b0e3-37e6a34c96f1', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('ef1200f2-3beb-4616-b4d1-8438183eaa0c', 'd0630165-6aba-4707-b0e3-37e6a34c96f1', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('84eb5d7d-ed92-4332-ad3a-fc7f3a68b083', '1dc4ff0f-2232-44fc-b639-b918a9c8915c', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('557bdd4c-7f47-439e-b120-d50d5632424c', '1dc4ff0f-2232-44fc-b639-b918a9c8915c', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('dbc98977-306f-4ba6-9629-d1875ad11d96', '1dc4ff0f-2232-44fc-b639-b918a9c8915c', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('5bb0a048-0e13-4e1c-97bb-252d162dc99f', '1dc4ff0f-2232-44fc-b639-b918a9c8915c', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('0c4a00ec-0721-4b16-8a5e-6338de9a11f7', '5c895027-e599-4cd9-82be-7e969b0c422e', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 5, NULL, NULL, NULL, NULL),
	('463d4399-bc07-4922-8da4-c2671a60d1d4', '5c895027-e599-4cd9-82be-7e969b0c422e', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 5, NULL, NULL, NULL, NULL),
	('21fb67e0-1a15-4bf9-b8d5-99ca535f10a7', '48d1b349-4dac-49f1-b498-7dcc404df033', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('eafa459a-d6f5-436f-8edb-309c283c89ae', '48d1b349-4dac-49f1-b498-7dcc404df033', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('45dce40c-fc90-4b5e-89ad-4d8ee489ebdb', '48d1b349-4dac-49f1-b498-7dcc404df033', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('38bde21c-ef3a-4ea6-bfed-661ef95f6459', 'ba50be1f-9d8c-40c0-82da-a982558498fb', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('3416d08b-b251-4b05-be45-d7cb97165eee', 'ba50be1f-9d8c-40c0-82da-a982558498fb', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('a5843404-ed11-4eb6-ae0b-06f1675648c8', 'ba50be1f-9d8c-40c0-82da-a982558498fb', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('4db525d0-b897-4ca7-b514-5a6bec946e6f', 'ba50be1f-9d8c-40c0-82da-a982558498fb', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('4f9ed6bf-19e9-4749-ac08-b3638f8b979b', 'ba50be1f-9d8c-40c0-82da-a982558498fb', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('f4198784-ba6c-434b-b838-9a636c2a3bb9', 'a55e4026-066f-4e54-b51d-16f15e72229e', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('5e782968-41be-4905-bd98-e703ab276d7a', 'a55e4026-066f-4e54-b51d-16f15e72229e', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('87c5e827-1abd-4db3-9f5f-5070a6abe9ae', 'a55e4026-066f-4e54-b51d-16f15e72229e', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('762a36f7-06d1-4296-9017-ae671e15bdd4', 'a55e4026-066f-4e54-b51d-16f15e72229e', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('a1e5eee2-aa80-49b6-a4b6-0b19d859d84f', 'a70d98ee-179a-477e-bfb4-cfc38351c5f3', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('a64619f7-4bf6-4ba2-886c-17154306501b', 'a70d98ee-179a-477e-bfb4-cfc38351c5f3', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('c5854cd2-15f6-4866-a585-37c4bc2377ad', 'a70d98ee-179a-477e-bfb4-cfc38351c5f3', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('2ba3a508-3e1e-422a-9021-3c3f3dbd22ce', 'a70d98ee-179a-477e-bfb4-cfc38351c5f3', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('82f98348-c4ec-429c-a35a-fc23e9370d48', 'e59128ea-1762-4909-a21f-1c1f06b69e3e', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('d4360bf4-39df-4d0c-b878-05c663c3bf77', 'e59128ea-1762-4909-a21f-1c1f06b69e3e', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('4bead7e8-b30b-4730-9f81-31eff4baf6ee', 'e59128ea-1762-4909-a21f-1c1f06b69e3e', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('7a24fc88-6fcf-4243-9449-ce720897b04a', '4d6027d3-09de-48af-84a4-4baa2f63ed43', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('4a755351-dc43-4f78-84b1-ae735e71316a', '4d6027d3-09de-48af-84a4-4baa2f63ed43', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('3b7eaadd-44db-432e-8478-7aebbe313cb6', '4d6027d3-09de-48af-84a4-4baa2f63ed43', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('f083ac5c-6400-4d0d-b484-9352b9497363', '4d6027d3-09de-48af-84a4-4baa2f63ed43', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('49666b0b-008f-46e6-b335-8d459ef605c1', '4d6027d3-09de-48af-84a4-4baa2f63ed43', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('70a86b11-cba1-4b69-85d9-2a72b615e5cc', '7846aa02-1003-4e2e-881b-732c0d595a05', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('7fdfad8d-a9da-4c99-a435-4ce7a4603fd0', '7846aa02-1003-4e2e-881b-732c0d595a05', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('5601e89c-e946-4d5f-b8de-ec5777604725', '7846aa02-1003-4e2e-881b-732c0d595a05', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('beaae21b-dbe7-4867-9fe8-e7e343f38470', '7846aa02-1003-4e2e-881b-732c0d595a05', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('4979957a-59bf-46fe-8fce-e9620f31e22a', '7846aa02-1003-4e2e-881b-732c0d595a05', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('ebbe25e7-c64f-4023-a189-7687a3d61516', '5ab23831-3c49-4d60-ad05-37e40be25171', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('cbdf46b1-b251-4f95-953b-044ab2885541', '5ab23831-3c49-4d60-ad05-37e40be25171', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('98b4a1ff-04fc-4309-933f-f6f2022d909e', '5ab23831-3c49-4d60-ad05-37e40be25171', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('9381b435-7868-4f50-8b6a-e665dbd73788', '5ab23831-3c49-4d60-ad05-37e40be25171', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('2c5890c2-048d-47f4-b71c-cbb6df2614b3', 'ccb6d79f-8bc9-48ac-8d80-860fcf666082', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('f56d7fa6-79f3-4e00-8124-a9678dc8014d', 'ccb6d79f-8bc9-48ac-8d80-860fcf666082', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('1785ced9-4aea-44f1-8b0e-72f54618b743', 'ccb6d79f-8bc9-48ac-8d80-860fcf666082', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('cb5f9097-3f48-44ab-b76a-cb81fc39e989', '4435addc-c2f9-4f56-ab02-9a94120f49e8', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('122bc94b-0dd9-4a6a-bd61-81ac967ec787', 'fbeb7025-caa8-4e6d-9181-9592076c79d4', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('95aa76df-73f8-40f7-83b1-12bd4eb5f7a4', 'fbeb7025-caa8-4e6d-9181-9592076c79d4', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('48f9844e-180d-47f1-b88c-f53f4d00efaf', 'fbeb7025-caa8-4e6d-9181-9592076c79d4', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('7a3f1048-2097-4fda-9410-a0e53719e561', 'fbeb7025-caa8-4e6d-9181-9592076c79d4', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('41df02c7-0f3e-443b-b2f4-a4fb80797e24', 'fbeb7025-caa8-4e6d-9181-9592076c79d4', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('978b8d4d-2390-4294-b8c3-6f5396ada89a', 'fbeb7025-caa8-4e6d-9181-9592076c79d4', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('742170aa-c925-4405-b918-6c3d8ddcf344', 'f5cddecc-795a-4ceb-aeef-49c856907ba8', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('57407e35-d00d-4116-84ee-acfd9e1e6478', 'f5cddecc-795a-4ceb-aeef-49c856907ba8', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('9a8b74ec-09c5-4430-b1cc-0c996b88b0cd', 'f5cddecc-795a-4ceb-aeef-49c856907ba8', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('245ed33d-2025-455c-a91e-c638ee6bb4fe', 'f5cddecc-795a-4ceb-aeef-49c856907ba8', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('75278594-4da6-4e04-853b-1f9e684e071a', '5cfb1e39-c5a7-48a7-8432-2bb304365c29', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('dbabd6f6-1580-4505-9180-8a0f12e1323e', '5cfb1e39-c5a7-48a7-8432-2bb304365c29', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('fe386560-65e2-48ba-b850-1072241f208c', '5cfb1e39-c5a7-48a7-8432-2bb304365c29', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('31e36276-4170-4761-86d8-ce96ca9e034d', '5cfb1e39-c5a7-48a7-8432-2bb304365c29', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('4bcbefcb-d6ef-45bd-b13e-ec4d7287fbfe', '5cfb1e39-c5a7-48a7-8432-2bb304365c29', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('8d829742-5b77-4903-a43c-c6cc0d74c908', '5cfb1e39-c5a7-48a7-8432-2bb304365c29', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('b7030803-e446-463b-9f80-7ab23b852833', '3f4828bb-f5ab-4e6b-8b09-5e6e7f31511b', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('6476c7be-6569-4f4b-969b-96cc4de4e970', '3f4828bb-f5ab-4e6b-8b09-5e6e7f31511b', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('a554ab86-ebd1-479b-a4a2-af56ac057f6e', '3f4828bb-f5ab-4e6b-8b09-5e6e7f31511b', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('46bffcec-224c-4816-8f82-6126e9b06b28', '3f4828bb-f5ab-4e6b-8b09-5e6e7f31511b', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('4b431709-a100-4ce8-832b-12cb329382ee', '59adf942-4e9d-48c5-b45d-45f1b3819217', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('0ec00413-dbf4-4c5e-9372-1c968ced872d', '59adf942-4e9d-48c5-b45d-45f1b3819217', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('bed61ae4-e4a1-415e-a984-d6a6c296da70', '59adf942-4e9d-48c5-b45d-45f1b3819217', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('ddd62ae8-ea0e-47f9-b393-289ffa116ca4', '59adf942-4e9d-48c5-b45d-45f1b3819217', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('3cc3c164-ec45-462d-9076-cd15bc8649a6', '59adf942-4e9d-48c5-b45d-45f1b3819217', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('405c27a3-ec4e-4f5d-82ce-eeb963a4b721', 'b2f44b76-7de6-4598-ac55-0d3fc405f286', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, 'Less Spicy', NULL, NULL, NULL),
	('9adf22e1-0b9a-4265-b98b-ba75d00590ce', 'b2f44b76-7de6-4598-ac55-0d3fc405f286', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, 'Less Spicy', NULL, NULL, NULL),
	('1bbf1f4c-3d48-4c75-9fc9-d7422e1191b9', 'b2f44b76-7de6-4598-ac55-0d3fc405f286', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, 'Extra Spicy', NULL, NULL, NULL),
	('64e15b49-88bf-404c-af8c-4e986c04650f', 'b2f44b76-7de6-4598-ac55-0d3fc405f286', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, 'Less Spicy', NULL, NULL, NULL),
	('decbe6a8-f9ae-401a-8e1d-e4dcbcd31f73', '8a7679a3-838d-4841-b8cc-e4672bd30c6a', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, 'No Onion', NULL, NULL, NULL),
	('6afd94c0-25d2-4c53-a498-77d23e3d8fb5', '8a7679a3-838d-4841-b8cc-e4672bd30c6a', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, 'Pls butter kam dalna', NULL, NULL, NULL),
	('2334ae52-19d5-4c3a-8589-cc5ed4674b04', '8a7679a3-838d-4841-b8cc-e4672bd30c6a', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, 'Pls gravy best banana', NULL, NULL, NULL),
	('54f3cec7-3714-4a0b-a4d2-308e02f104dc', 'daa01d26-d7bc-4b76-9515-d70c4f45a60f', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('c2de007c-3238-49c5-a8d7-d8bc074461a1', 'daa01d26-d7bc-4b76-9515-d70c4f45a60f', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('3b25c5ca-9f73-4530-b140-cd7b9278d11a', 'daa01d26-d7bc-4b76-9515-d70c4f45a60f', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('dbf28fa6-c236-458f-ae4a-e63ee0ca2879', '6b72c37e-3e90-4f9b-a856-02f6c23a6e6d', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('e46b63e6-82f1-4324-a993-8aa2d5904d57', '6b72c37e-3e90-4f9b-a856-02f6c23a6e6d', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('49762ded-a72b-4905-b4fc-87f4d6d5d0ee', 'dd5efc65-8e42-4ad7-b631-1adc351581bc', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, 'Less spicy', NULL, NULL, NULL),
	('62688ac4-21f0-4d53-9b3e-c59103372c20', 'b015ebe7-c1b6-4fb1-9740-a7f2c438df31', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('354ed641-2c32-4234-9185-b426644960f8', 'b015ebe7-c1b6-4fb1-9740-a7f2c438df31', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('6dece6e5-fda4-4ba0-9145-c8c16eff9054', '4ec56754-76d5-40c0-a857-337cd403f209', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('09b558cc-e60b-4021-bf4f-7140ddf8f7b0', '4ec56754-76d5-40c0-a857-337cd403f209', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, NULL, NULL, NULL),
	('44a06287-1e93-4b3b-9725-e7945404f9e6', '4ec56754-76d5-40c0-a857-337cd403f209', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('6bc81f30-e5b5-4f0b-952d-3380707ea712', '4ec56754-76d5-40c0-a857-337cd403f209', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, NULL, NULL, NULL),
	('e106b94c-8e95-4918-ba89-41631de30ca1', '4ec56754-76d5-40c0-a857-337cd403f209', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, NULL, NULL, NULL),
	('e502cdf0-80cc-49bb-b06f-e91c3c7fcfb4', '4ec56754-76d5-40c0-a857-337cd403f209', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('6d596266-5ec6-4978-b8c9-aaf6b9d2e562', '3e5972d9-82db-404b-a89b-bb047ebc6975', 'db1e955e-b248-4812-aef8-842ad1877da1', 1, 'yyyyyyyyyyyyy', NULL, NULL, NULL),
	('ebe75fed-48a9-4a28-97f7-d61f0ad2b706', '3e5972d9-82db-404b-a89b-bb047ebc6975', 'ff224247-da59-4504-ad77-39aa6cedbff7', 1, 'hhhh', NULL, NULL, NULL),
	('4f3640cb-efc9-4484-9b8b-2f6fe11edf59', '9133baa3-bde1-430b-949a-dc71e762bdc4', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, NULL, NULL, NULL),
	('80a5b133-ef76-4f4a-8806-61814d0ba836', '9133baa3-bde1-430b-949a-dc71e762bdc4', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('cd132166-598e-470f-b1b2-6cacf024ab86', '5aaec7bf-4e15-49c3-88d9-62d21578962f', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, 'Spicy', NULL, NULL, NULL),
	('3dcf503e-713d-4c16-b2fd-c888ee885be3', '5aaec7bf-4e15-49c3-88d9-62d21578962f', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, 'Non spicy', NULL, NULL, NULL),
	('ea98fd2f-d09e-4e86-8217-6d36506a2849', '522e2366-840c-47fb-9169-8da04672bdbc', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, NULL, NULL, NULL),
	('b45ade22-5bc1-465f-aad2-c099c1c3c438', '522e2366-840c-47fb-9169-8da04672bdbc', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, NULL, NULL, NULL),
	('d1701b09-fcfa-44ff-bf8d-cd9f2a2a0ce5', '522e2366-840c-47fb-9169-8da04672bdbc', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, NULL, NULL, NULL),
	('8b40e79f-7cc1-4c10-a82a-aa2e01eb7987', 'a362bb68-1701-4a88-aae9-9c6283a364f5', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('ca2da1d9-364d-47bf-88e8-3f23db01fd90', 'a362bb68-1701-4a88-aae9-9c6283a364f5', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, 'Fried Rice', 150.00, 150.00),
	('88357276-6a45-4e0b-afa9-136222e578ba', '354b451d-05bd-439c-b333-c6266d8c02d1', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, 'Spicy', 'Paneer Bhurzi', 350.00, 350.00),
	('545b8d43-0e3d-4612-b4ff-d2552e183bc3', '354b451d-05bd-439c-b333-c6266d8c02d1', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 5, 'More spicy', 'Samosa', 30.00, 150.00),
	('0a852522-6e51-44bf-bfc6-ca878dd200c9', '354b451d-05bd-439c-b333-c6266d8c02d1', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 2, 'Non spicy', 'Prantha ', 140.00, 280.00),
	('3ec2f171-d019-45c2-98fa-0f655c703aec', '9c8d2eea-6f5c-4a55-bd88-62ac2e9a68ab', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('ef9134d2-3f36-469b-9869-00142dd62e12', '9c8d2eea-6f5c-4a55-bd88-62ac2e9a68ab', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, 'Paneer Bhurzi', 350.00, 350.00),
	('3a1937ac-66ed-4070-be68-e49393afb5e8', '9c8d2eea-6f5c-4a55-bd88-62ac2e9a68ab', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 1, NULL, 'Prantha ', 140.00, 140.00),
	('d3d9029a-9b6c-4221-b04c-b8462af8eef4', 'bfad9ef6-cd8d-4f65-97dc-e614655c4fd0', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, 'Samosa', 30.00, 30.00),
	('a6193d01-ad95-443c-a3c8-97493dc0362a', '8cce6088-ec4f-4393-a615-994715d2b687', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('8c8dcf15-4128-4b4e-8080-4d2ff49711aa', 'be59b3a2-a275-4899-be8a-c4d88d5525c1', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('7d23ae99-368a-437e-9fd2-6c3a0b2182ad', 'be59b3a2-a275-4899-be8a-c4d88d5525c1', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, 'Paneer Bhurzi', 350.00, 350.00),
	('35f16bdf-885b-4835-a5e6-b0630a23b45a', '21029d13-dbf7-46ca-9da3-86f039f63fba', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, 'Kadai Paneer', 320.00, 320.00),
	('e997318f-db3f-44a3-b233-467e23610794', '21029d13-dbf7-46ca-9da3-86f039f63fba', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, 'Paneer Bhurzi', 350.00, 350.00),
	('c4e3e9b1-8c70-46ce-a18a-90a32f3a8fee', '9b15d3bc-76f9-4356-a396-3c7164e024a8', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('4e84175d-f8ae-48ac-9a3e-17e4d2a46474', '9b15d3bc-76f9-4356-a396-3c7164e024a8', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 5, NULL, 'Fried Rice', 150.00, 750.00),
	('11a3dab0-508e-4cd0-bfc6-87058e365cb1', 'b5131d46-ccd4-44e0-a96d-2beea71ccb19', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, 'Samosa', 30.00, 30.00),
	('7f55a588-a3cb-414d-b197-e492122b0dee', 'b5131d46-ccd4-44e0-a96d-2beea71ccb19', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, 'Shahi Paneer ', 320.00, 320.00),
	('c1f4fa61-0bd4-4d05-a3a4-6bfd9e55d05d', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('93242701-b427-4b8a-89e8-b7215d0d865b', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, 'Fried Rice', 150.00, 150.00),
	('1efd6b36-d8e6-43cd-91c0-5aaeee9ef8a0', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 6, NULL, 'Samosa', 30.00, 180.00),
	('707e49ae-8b94-4bf8-a907-e08f55178b72', '1df1892b-47d3-4094-b2a0-abbbd2d228e8', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 3, NULL, 'Shahi Paneer ', 320.00, 960.00),
	('3f1405c8-a13b-4686-974d-0dd793510b7f', 'b5131d46-ccd4-44e0-a96d-2beea71ccb19', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, 'Kadai Paneer', 320.00, 320.00),
	('c355b81a-5cdf-473d-8045-e50c358d3a91', '117c4166-5b55-4685-9ec7-f1f8562cc9b1', '5d3473bc-94ce-418a-b636-d1a882e7c20e', 1, NULL, 'Samosa', 30.00, 30.00),
	('ec28dc6d-0cec-488c-8928-e1877cbae54d', '117c4166-5b55-4685-9ec7-f1f8562cc9b1', '51572150-a5d6-4b70-bba0-75f0cd4d1587', 1, NULL, 'Shahi Paneer ', 320.00, 320.00),
	('c8aa6493-68ac-44f4-b7ab-ed2a61e7bbf4', '1367b075-7618-4588-8cad-873edc04d4e9', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('1f1684b8-52ff-4f10-b149-de9216e51ca4', '1367b075-7618-4588-8cad-873edc04d4e9', '33ff4afb-5e78-4c17-b20c-b62aca48c6d8', 5, NULL, 'Prantha ', 140.00, 700.00),
	('f1ad3bff-5219-4c11-bd28-d00cda8236cf', '1367b075-7618-4588-8cad-873edc04d4e9', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, 'Paneer Bhurzi', 350.00, 350.00),
	('898adc52-b877-4435-97eb-4ffad60e06ee', 'f57a6d18-a75d-415d-adf9-9af144240481', '89fd4bc2-35af-450b-80c2-1504c19c3e48', 1, NULL, 'Chowmin', 150.00, 150.00),
	('19b6ae78-720f-43a6-b5ce-7d25cab2dcc3', 'f57a6d18-a75d-415d-adf9-9af144240481', '3b1d3ded-9ff7-4087-8094-5bd07ed5dca5', 1, NULL, 'Fried Rice', 150.00, 150.00),
	('63f9a6bb-f4f0-46eb-b579-6dab353dccff', 'f57a6d18-a75d-415d-adf9-9af144240481', '24286df1-f8a6-4bf4-ae4e-09da11c32744', 1, NULL, 'Paneer Bhurzi', 350.00, 350.00),
	('583f5295-34f6-44d3-9af4-79b6a6c0846a', '117c4166-5b55-4685-9ec7-f1f8562cc9b1', 'a989b11c-ca76-48d0-9c81-c41c2695ea7a', 1, NULL, 'Kadai Paneer', 320.00, 320.00);


--
-- Data for Name: plugin_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: plugin_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."plugin_settings" ("id", "restaurant_id", "plugin_code", "config", "created_at") VALUES
	('d73dce1d-e60f-461e-a7e7-26ccbe1781fd', '8118f344-f928-42b8-950d-7910fd7f09d4', 'whatsapp', '{"number": "+919736580084"}', '2026-04-11 21:14:47.083307'),
	('1111dda1-0fd4-4576-8213-4dba1df068f4', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'whatsapp', '{"number": "+919736580084"}', '2026-04-11 21:04:22.570422'),
	('fed35b1b-2714-4ee7-ae86-681d39520e39', '2efbb5f5-3975-4a41-934d-335b61f83bfa', 'whatsapp', '{"number": "+919736580084"}', '2026-08-16 05:54:16.776109');


--
-- Data for Name: plugins; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "restaurant_id", "role", "email") VALUES
	('ddc6c5f2-5f38-482d-b51f-66917a523f04', '8118f344-f928-42b8-950d-7910fd7f09d4', 'admin', 'chaichaatandchapati@gmail.com'),
	('75a0678a-6ca2-46b9-9e48-0ee91715650e', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'admin', 'cafenh3bashing@gmail.com'),
	('f146e695-6f5c-4bf1-8560-9632f427975b', NULL, 'super_admin', 'anairagraphicsdigitalsolution@gmail.com'),
	('60e9a4ed-4054-4ab3-af83-b893dbb4e108', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'staff', NULL),
	('e5896e19-6bc0-4671-a071-798b2cf1b540', '2efbb5f5-3975-4a41-934d-335b61f83bfa', 'admin', NULL);


--
-- Data for Name: reservations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: restaurant_banners; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."restaurant_banners" ("id", "restaurant_id", "image_url", "sort_order", "created_at") VALUES
	('5582c55e-7510-461b-927e-10f74bee349e', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/restaurant-covers/banner-1784022544720-0.5796453426464293.png', 4, '2026-07-14 09:49:07.100745+00'),
	('b42b4058-f4d5-4cb5-bb6f-20ad5bca85d3', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/restaurant-covers/banner-1784022547382-0.5273555663321088.png', 4, '2026-07-14 09:49:09.265405+00'),
	('820e8130-7928-4e8b-a959-ea77bdc8c78f', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/restaurant-covers/banner-1784022923627-0.5739892656651845.jpeg', 4, '2026-07-14 09:55:26.25377+00'),
	('f67879c5-0f2f-4be5-9ea2-e3ed256e0d56', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/restaurant-covers/banner-1784035917975-0.4106962545201305.jpeg', 4, '2026-07-14 13:32:00.784322+00'),
	('7ee52c6f-84e2-4a4a-8c98-f0d572145854', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/restaurant-covers/banner-1784035920100-0.21336021470384559.jpeg', 4, '2026-07-14 13:32:01.720222+00'),
	('cdd0924b-7242-4809-9cbf-f165ac1fa817', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 'https://vgzwzvmuylsoqjkqfcnw.supabase.co/storage/v1/object/public/restaurant-covers/banner-1784035920975-0.19027231434780545.jpeg', 4, '2026-07-14 13:32:02.457137+00');


--
-- Data for Name: restaurant_plugins; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."restaurant_plugins" ("id", "restaurant_id", "plugin_slug", "enabled", "config", "created_at", "plugin_code") VALUES
	('dfc20ccf-79f6-4675-bb78-e58df4dc6da8', '8118f344-f928-42b8-950d-7910fd7f09d4', NULL, true, '{}', '2026-04-15 19:37:30.09449', 'whatsapp'),
	('a920dbd5-e3b9-4e77-885f-0d7171a0d560', '8118f344-f928-42b8-950d-7910fd7f09d4', NULL, true, '{}', '2026-04-15 19:37:32.146564', 'qr-menu'),
	('8d125bd5-958a-453d-919f-f34d5e641a1b', '8118f344-f928-42b8-950d-7910fd7f09d4', NULL, true, '{}', '2026-04-15 19:37:38.771361', 'billing'),
	('631cb809-2751-4e37-bb8f-acbee3ea8e9c', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', NULL, false, '{}', '2026-04-15 19:57:36.313775', 'qr-menu'),
	('c96b64ad-5ad3-4b18-8d4a-1510de19c06f', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', NULL, false, '{}', '2026-04-15 19:57:34.661506', 'whatsapp'),
	('7789592a-6254-4a1f-ac58-3b91f1b2528d', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', NULL, true, '{}', '2026-04-15 20:40:39.221067', 'pos');


--
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."rooms" ("id", "room_number", "restaurant_id") VALUES
	('79c70831-99c2-432e-95fa-300c181fd3a1', 101, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('4238ec7b-bf25-4ab4-ae56-7de5a8de288f', 102, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('d8d13814-e134-4780-a225-693f22402c61', 103, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('f84ed16b-1b1b-410c-9bdd-0789ccb235ce', 109, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('5ff2ef00-99a5-43f0-a293-2d9464611490', 201, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('02101daf-3817-4fbb-9bc4-f526dbafb1f1', 202, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('9ce25ffe-335a-44ef-abae-e33d902c65c8', 101, '8118f344-f928-42b8-950d-7910fd7f09d4'),
	('9313306b-7380-4c30-9926-ddefd819af1d', 102, '8118f344-f928-42b8-950d-7910fd7f09d4'),
	('2b65da29-a908-48e5-a551-ea18b1d79663', 401, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('4ac260eb-3d77-46da-a410-d5c0f300aa96', 303, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53'),
	('1c5b78fb-edab-4daa-a6f2-23d743e07466', 103, '8118f344-f928-42b8-950d-7910fd7f09d4');


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."settings" ("id", "user_id", "gst_enabled", "gst_rate", "created_at") VALUES
	('75a0678a-6ca2-46b9-9e48-0ee91715650e', NULL, true, 5, '2026-04-10 23:38:09');


--
-- Data for Name: stock_usage; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."stock_usage" ("id", "restaurant_id", "inventory_id", "item_name", "used_qty", "unit", "reason", "used_by", "notes", "created_at") VALUES
	('7a919de4-557f-444f-a24d-0a97c06bfa7d', 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', '1244631d-3e97-4dee-8c2f-32e4cff3341c', 'toamto', 10, 'kg', 'Kitchen', NULL, NULL, '2026-07-19 11:13:50.253219+00');


--
-- Data for Name: tables; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."tables" ("id", "table_number", "restaurant_id", "seats") VALUES
	('270c2565-aa8a-4117-a030-1ae1dab75728', 1, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('31820cc0-7b50-46b3-89a1-1b64d6b66631', 2, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('5bfb9c6f-7400-4118-942a-0fd3d7589df5', 3, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('87b8e577-7260-455d-a8bf-3970f3e99704', 5, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('849ad571-81aa-46a2-a576-538d96afec90', 4, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('a6ce5a4d-a222-489f-a5c5-aebaa15201f0', 6, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('f58327b1-25aa-4256-a1ec-75eb6d1f156d', 7, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('fbd5f831-94e0-4e92-b4d3-b5876964d4b1', 8, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('2c6f2fff-b649-4570-b635-113fc30f0f0b', 9, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('e08ad195-48e8-4166-9f4f-2c060909f641', 10, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('1cfe3a88-1633-4509-8011-d6c276ac9d2c', 1, '8118f344-f928-42b8-950d-7910fd7f09d4', 4),
	('db108c64-ea69-4e56-ae79-b1c3147aa724', 2, '8118f344-f928-42b8-950d-7910fd7f09d4', 4),
	('816a2d4a-1d69-4f5b-8799-68fc626ccde4', 3, '8118f344-f928-42b8-950d-7910fd7f09d4', 4),
	('de4f2a0f-7abb-454b-b55a-273abb12623f', 140, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4),
	('b87eaddf-63b1-4c66-8393-c2b2ba723259', 46, 'b2d13e4b-7e68-4a70-b9b7-aaff5b137b53', 4);


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('logos', 'logos', NULL, '2026-03-31 17:53:14.872832+00', '2026-03-31 17:53:14.872832+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('menu-images', 'menu-images', NULL, '2026-03-31 19:13:35.825942+00', '2026-03-31 19:13:35.825942+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('restaurant-covers', 'restaurant-covers', NULL, '2026-07-13 21:46:13.245109+00', '2026-07-13 21:46:13.245109+00', true, false, NULL, NULL, NULL, 'STANDARD');


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata") VALUES
	('cfb0bd92-2d38-49c8-b283-83196f3fd88c', 'logos', 'logo-b2d13e4b-7e68-4a70-b9b7-aaff5b137b53-1774980825134.png', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-03-31 18:13:46.17099+00', '2026-03-31 18:13:46.17099+00', '2026-03-31 18:13:46.17099+00', '{"eTag": "\"fc20d1815106e34c0d3281fb790ccd51\"", "size": 115055, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-03-31T18:13:47.000Z", "contentLength": 115055, "httpStatusCode": 200}', 'e497d888-937e-4727-b52c-1d90e91b28ae', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('1782f89a-fd8f-4d0f-8922-16dd0f950f38', 'logos', 'logo-8118f344-f928-42b8-950d-7910fd7f09d4-1774983619483.png', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '2026-03-31 19:00:24.45386+00', '2026-03-31 19:00:24.45386+00', '2026-03-31 19:00:24.45386+00', '{"eTag": "\"811332aa66f9959d9d080af9d369e6fd-3\"", "size": 12996421, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-03-31T19:00:24.000Z", "contentLength": 12996421, "httpStatusCode": 200}', 'b31abe4a-7dba-47b7-b2b2-5b634aa3acd5', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '{}'),
	('e6476495-0686-4425-9047-6345c0a8ceb7', 'menu-images', 'item-1774984532037.webp', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '2026-03-31 19:15:33.524816+00', '2026-03-31 19:15:33.524816+00', '2026-03-31 19:15:33.524816+00', '{"eTag": "\"65376d6b35671f378d3c95ca9dbdb282\"", "size": 225326, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-03-31T19:15:34.000Z", "contentLength": 225326, "httpStatusCode": 200}', 'a95676a0-aa87-4479-8a5c-4067fbe850d8', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '{}'),
	('290c3c52-7d60-4e22-8eb2-e16af8943296', 'menu-images', 'menu-1774988640094.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-03-31 20:24:00.92203+00', '2026-03-31 20:24:00.92203+00', '2026-03-31 20:24:00.92203+00', '{"eTag": "\"118d4f16bfd4e806145c8ab6e1d16784\"", "size": 108122, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-03-31T20:24:01.000Z", "contentLength": 108122, "httpStatusCode": 200}', 'ed7334d1-9718-4481-8f0a-2b079305da53', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('e5962bfc-2d1e-4d15-b400-4ef16942e57a', 'menu-images', 'menu-1774988658447.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-03-31 20:24:19.096894+00', '2026-03-31 20:24:19.096894+00', '2026-03-31 20:24:19.096894+00', '{"eTag": "\"ed2f559ef7406c68cc886f58c2ad6aa4\"", "size": 165716, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-03-31T20:24:20.000Z", "contentLength": 165716, "httpStatusCode": 200}', 'eef6f265-a2c1-4d59-9076-0542ca1c6998', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('5171a7e0-ceff-44fa-a794-91874b198dac', 'menu-images', 'menu-1775025982695.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:46:24.688706+00', '2026-04-01 06:46:24.688706+00', '2026-04-01 06:46:24.688706+00', '{"eTag": "\"fa85817511653107945b86bfc916f5f3\"", "size": 3255705, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:46:25.000Z", "contentLength": 3255705, "httpStatusCode": 200}', '3b6140f4-79b9-4666-afff-4e852f735a9e', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('48b8acfb-dd1d-4793-97b5-c50627a535fd', 'menu-images', 'menu-1775026002661.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:46:45.618032+00', '2026-04-01 06:46:45.618032+00', '2026-04-01 06:46:45.618032+00', '{"eTag": "\"fdef70ebd61eea0478c8fc77d5c57f0b-2\"", "size": 7904257, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:46:46.000Z", "contentLength": 7904257, "httpStatusCode": 200}', '0c9badd7-2eef-4ae3-b3ab-3f931697641f', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('ee966834-579d-4b30-b19e-f5ccfeb19f3e', 'menu-images', 'menu-1775026023134.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:47:05.2908+00', '2026-04-01 06:47:05.2908+00', '2026-04-01 06:47:05.2908+00', '{"eTag": "\"325577a50a1c9598c2e1df26dd647726\"", "size": 4206884, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:47:05.000Z", "contentLength": 4206884, "httpStatusCode": 200}', '557e903e-5867-4d0c-81b2-120e0cf74f11', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('af31067d-7967-496c-b02c-390d97ef1d49', 'menu-images', 'menu-1775026056055.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:47:39.239342+00', '2026-04-01 06:47:39.239342+00', '2026-04-01 06:47:39.239342+00', '{"eTag": "\"ca70bb4496167a048c4f0315dc53778e-2\"", "size": 7558723, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:47:39.000Z", "contentLength": 7558723, "httpStatusCode": 200}', '6ef24b1a-1033-4877-8fdd-9413d0561c26', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('419c4e70-fcba-47db-93d5-4decf1d127cc', 'menu-images', 'menu-1775026088754.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:48:11.724602+00', '2026-04-01 06:48:11.724602+00', '2026-04-01 06:48:11.724602+00', '{"eTag": "\"dd750bcfdda3af38d5979243ad90fad5-2\"", "size": 6987634, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:48:12.000Z", "contentLength": 6987634, "httpStatusCode": 200}', 'f42c0f4a-5714-4eb9-a8c2-c7cdb551f8d8', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('1527c683-01cb-4057-9997-b138bc507dcd', 'menu-images', 'menu-1775026113097.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:48:36.507169+00', '2026-04-01 06:48:36.507169+00', '2026-04-01 06:48:36.507169+00', '{"eTag": "\"654d05bf4794961849fb36dfa04fc19f-2\"", "size": 8956628, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:48:36.000Z", "contentLength": 8956628, "httpStatusCode": 200}', '95d5c8a9-db21-4206-a58a-5a332b721c15', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('48c9d193-adf3-48f9-95b4-e87b790a2765', 'menu-images', 'menu-1775026129059.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:48:50.41104+00', '2026-04-01 06:48:50.41104+00', '2026-04-01 06:48:50.41104+00', '{"eTag": "\"8688089d9fa7612bf1fb012efba3a267\"", "size": 1668391, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:48:51.000Z", "contentLength": 1668391, "httpStatusCode": 200}', '8fef4f97-a3a2-4adc-8722-957ba8dc7a99', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('3ed1e4c5-0f9a-492d-a5a3-7289bcc935ab', 'menu-images', 'menu-1775026152840.jpeg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-01 06:49:13.086514+00', '2026-04-01 06:49:13.086514+00', '2026-04-01 06:49:13.086514+00', '{"eTag": "\"e4e79bf031011651ebe973720b402418\"", "size": 12550, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-01T06:49:14.000Z", "contentLength": 12550, "httpStatusCode": 200}', 'c586f275-3c09-4474-b69e-32cc01f206c7', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('dc4fbef6-8b72-460e-b4c8-56a561b55ba3', 'menu-images', 'item-1776085855324.jpg', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '2026-04-13 13:10:55.875368+00', '2026-04-13 13:10:55.875368+00', '2026-04-13 13:10:55.875368+00', '{"eTag": "\"a964fd30ffc8e3cf5af95a3ad0f48a75\"", "size": 202338, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-13T13:10:56.000Z", "contentLength": 202338, "httpStatusCode": 200}', 'a1fd8a48-1db9-4ae1-a35d-10000f431138', 'ddc6c5f2-5f38-482d-b51f-66917a523f04', '{}'),
	('20c345ed-aa5a-48a1-87f5-d96b18bde0bb', 'menu-images', 'menu-1776085998278.jpg', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-13 13:13:18.815243+00', '2026-04-13 13:13:18.815243+00', '2026-04-13 13:13:18.815243+00', '{"eTag": "\"50d3f26320bc947fda003e782b11931e\"", "size": 104490, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-13T13:13:19.000Z", "contentLength": 104490, "httpStatusCode": 200}', '0733011c-5429-4da4-9a65-71e312945598', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('b12cc3ca-a3ae-468f-9816-27995f3aee32', 'menu-images', 'menu-1776086055710.webp', 'f146e695-6f5c-4bf1-8560-9632f427975b', '2026-04-13 13:14:16.187617+00', '2026-04-13 13:14:16.187617+00', '2026-04-13 13:14:16.187617+00', '{"eTag": "\"161e0113a3020ebafa74ddafd54413e2\"", "size": 89478, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-13T13:14:17.000Z", "contentLength": 89478, "httpStatusCode": 200}', '5b9bd125-a6e2-49f3-9352-ddf21e9f5906', 'f146e695-6f5c-4bf1-8560-9632f427975b', '{}'),
	('df7c8342-f0e2-4bc4-9fc2-2a4937781fcb', 'restaurant-covers', '.emptyFolderPlaceholder', NULL, '2026-07-14 09:26:59.948332+00', '2026-07-14 09:26:59.948332+00', '2026-07-14 09:26:59.948332+00', '{"eTag": "\"d41d8cd98f00b204e9800998ecf8427e\"", "size": 0, "mimetype": "application/octet-stream", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T09:26:59.983Z", "contentLength": 0, "httpStatusCode": 200}', '95a83bed-360f-4723-8e1f-fd8072704cbc', NULL, '{}'),
	('85ced1ff-3288-4ad3-b72f-60e9f5f8cb47', 'restaurant-covers', 'banner-1784022534373-0.6519730396363135.png', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 09:48:59.087292+00', '2026-07-14 09:48:59.087292+00', '2026-07-14 09:48:59.087292+00', '{"eTag": "\"712b67f9795f1e72aacf26711f8366c2\"", "size": 2599908, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T09:49:00.000Z", "contentLength": 2599908, "httpStatusCode": 200}', '1286d560-3e22-4a41-9de7-b3820f3597d6', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('d8b088b7-b5c8-4d94-bf48-cf22268e424a', 'restaurant-covers', 'banner-1784022539766-0.6807297646666514.png', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 09:49:03.96451+00', '2026-07-14 09:49:03.96451+00', '2026-07-14 09:49:03.96451+00', '{"eTag": "\"2e06318f95167c57659d06d26426bbc1\"", "size": 2075603, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T09:49:04.000Z", "contentLength": 2075603, "httpStatusCode": 200}', '69b7b005-b624-4778-b941-11450cf02884', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('c8c8094f-1eaf-497f-b21a-5b4d017b2bbf', 'restaurant-covers', 'banner-1784022544720-0.5796453426464293.png', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 09:49:06.90444+00', '2026-07-14 09:49:06.90444+00', '2026-07-14 09:49:06.90444+00', '{"eTag": "\"c493904cde78d28f89178af5996888f8\"", "size": 2444049, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T09:49:07.000Z", "contentLength": 2444049, "httpStatusCode": 200}', 'c1de3ffa-2375-46cf-b375-8e99ece836b8', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('1ac504f3-f1df-4bea-89f8-0478f64396a7', 'restaurant-covers', 'banner-1784022547382-0.5273555663321088.png', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 09:49:08.87105+00', '2026-07-14 09:49:08.87105+00', '2026-07-14 09:49:08.87105+00', '{"eTag": "\"ac5e8528b1817737e048229824dbf8eb\"", "size": 2072295, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T09:49:09.000Z", "contentLength": 2072295, "httpStatusCode": 200}', 'da94e98e-91cd-40b3-a2a0-a75cdadf989b', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('93728ac6-8f7a-4092-a303-0b3a081826af', 'restaurant-covers', 'banner-1784022923627-0.5739892656651845.jpeg', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 09:55:25.996014+00', '2026-07-14 09:55:25.996014+00', '2026-07-14 09:55:25.996014+00', '{"eTag": "\"6223042faa804912f9581f10cbf25862\"", "size": 5369192, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T09:55:26.000Z", "contentLength": 5369192, "httpStatusCode": 200}', '2b61e805-ea4c-4e25-8b32-30b10e8f1933', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('31f984d9-c131-4962-be48-b702d1e7a144', 'restaurant-covers', 'banner-1784035917975-0.4106962545201305.jpeg', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 13:32:00.171827+00', '2026-07-14 13:32:00.171827+00', '2026-07-14 13:32:00.171827+00', '{"eTag": "\"2a81bf58d0c2ee3336682d69020d5f8a\"", "size": 130704, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T13:32:01.000Z", "contentLength": 130704, "httpStatusCode": 200}', 'ed8ff3d3-c690-4dcc-b77b-a4403219637b', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('3fef272e-5115-4c48-a9fd-0964e906f4f5', 'restaurant-covers', 'banner-1784035920100-0.21336021470384559.jpeg', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 13:32:01.446198+00', '2026-07-14 13:32:01.446198+00', '2026-07-14 13:32:01.446198+00', '{"eTag": "\"734aa836fbfb3eeecf0adf2049b2d7e1\"", "size": 89688, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T13:32:02.000Z", "contentLength": 89688, "httpStatusCode": 200}', '028b8748-0a26-445c-9769-0069785f7884', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}'),
	('d87486f0-737d-476e-9a91-0f9262698116', 'restaurant-covers', 'banner-1784035920975-0.19027231434780545.jpeg', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '2026-07-14 13:32:02.167522+00', '2026-07-14 13:32:02.167522+00', '2026-07-14 13:32:02.167522+00', '{"eTag": "\"da36ccb2aa12c19bfb6a2f268bf0071a\"", "size": 169810, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-14T13:32:03.000Z", "contentLength": 169810, "httpStatusCode": 200}', '66f8da30-c90e-4ff4-81af-ff61f89eaf1d', '75a0678a-6ca2-46b9-9e48-0ee91715650e', '{}');


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 518, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict 9Ao3vo5pVcsz6MbllKiRDqVXqxZoUvqJsNDC0NsD71fJZmA5MW5ckt1WdTpdEIz

RESET ALL;
