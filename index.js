const aws = require("aws-sdk");
const fileType = require("file-type");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");

const s3 = new aws.S3({ apiVersion: "2006-03-01" });

const dynamo = new aws.DynamoDB.DocumentClient();
const MARKER_DB = "memnut-markers";
const MEMAGE_DB = "memnut-memages";
const MEM_DB = "memnut-mems";
const VALID_BUCKET = "memnut-valid-images";

const validMimeType = (type) =>
  type === "image/jpeg" || type === "image/png" || type === "image/webp";
const validType = (type) =>
  type === "marker" || type === "mem" || type === "memage";

exports.handler = async (event) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " ")
  );
  try {
    var params = {
      Bucket: bucket,
      Key: key,
      Range: "bytes=0-4100",
    };
    const { ContentType, Body, Metadata } = await s3
      .getObject(params)
      .promise();

    const image_id = uuidv4();
    const type = Metadata.type;
    const creator = JSON.parse(Metadata.creator);

    const mimeType = await fileType.fromBuffer(Body);
    if (!validMimeType(ContentType) || !validMimeType(mimeType.mime)) {
      throw new Error("Invalid upload mime type");
    } else if (!validType(type)) {
      throw new Error("Invalid upload type");
    } else {
      var getparams = {
        Bucket: bucket,
        Key: key,
      };
      const getresp = await s3.getObject(getparams).promise();
      const raw_img = getresp.Body;

      const image_key = `${image_id}.webp`;
      // const image_key_md = `${image_id}_md.webp`
      // const image_key_sm = `${image_id}_sm.webp`

      let webp_image;
      if (mimeType.mime !== "image/webp") {
        webp_image = await sharp(raw_img).webp().toBuffer();
      } else {
        webp_image = raw_img;
      }

      const promises = [];

      promises.push(
        s3
          .putObject({
            Bucket: VALID_BUCKET,
            Key: image_key,
            Body: webp_image,
            ContentType: "image/webp",
          })
          .promise()
      );

      // promises.push(s3.putObject({
      //   Bucket: VALID_BUCKET,
      //   Key: image_key_md,
      //   Body: await sharp(webp_image)
      //     .resize(350, undefined, {
      //       fit: sharp.fit.cover,
      //     })
      //     .toBuffer(),
      //   ContentType: 'image/webp'
      // }).promise());

      // promises.push(s3.putObject({
      //   Bucket: VALID_BUCKET,
      //   Key: image_key_sm,
      //   Body: await sharp(webp_image)
      //     .resize(200, 200, {
      //       fit: sharp.fit.cover,
      //     })
      //     .toBuffer(),
      //   ContentType: 'image/webp'
      // }).promise());

      await Promise.all(promises);

      let db;
      const item = {
        image_key,
        creator,
        email: key,
      };

      if (type === "marker") {
        const markerid = Metadata.markerid;
        item["id"] = markerid;
        db = MARKER_DB;
      } else if (type === "memage") {
        const memageid = Metadata.memageid;
        item["id"] = memageid;
        db = MEMAGE_DB;
      } else if (type === "mem") {
        const memid = Metadata.memid;
        const memageid = Metadata.memageid;
        item["id"] = memid;
        item["memage_id"] = memageid;
        db = MEM_DB;
      }

      await dynamo
        .put({
          TableName: db,
          Item: item,
        })
        .promise();
    }
  } catch (err) {
    return "Error validatingobject";
  }
};
