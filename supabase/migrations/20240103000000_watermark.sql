-- Provenance watermark
--
-- The payload is the 32-byte record embedded in the exported PNG's pixels: a version byte, the
-- origin domain, the creator's UUID and a CRC. Storing a copy alongside the row means a gallery
-- image can be attributed by lookup even after the pixel layer has been stripped or the file
-- re-encoded, which is the common failure mode for anything living in the least significant bit.
--
-- Both columns are nullable: rows written before this migration, and any upload from a client that
-- did not stamp one, are recorded as null rather than being backfilled with a guess.
alter table shares add column if not exists watermark_payload bytea;
alter table shares add column if not exists watermark_version smallint;

comment on column shares.watermark_payload is
  '32-byte provenance payload embedded in image pixels: version|domain|user uuid|crc16';
comment on column shares.watermark_version is
  'Watermark payload format version, so a future layout can be told apart from this one';