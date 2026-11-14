-- One hackathon for dev/demo/production so the UI has something to point at.
-- (Tests truncate tables and create their own hackathons.)
INSERT INTO hackathons (name, min_team_size, max_team_size) VALUES ('Default Hackathon', 2, 4);
