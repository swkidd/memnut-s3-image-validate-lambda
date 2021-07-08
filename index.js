const aws = require("aws-sdk");
const fileType = require("file-type");
const sharp = require("sharp");

const s3 = new aws.S3({ apiVersion: "2006-03-01" });

const VALID_BUCKET = "memnut-valid-images";

const validMimeType = (type) =>
  type === "image/jpeg" || type === "image/png" || type === "image/webp";

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

    const imageKey = Metadata.imageKey;

    const mimeType = await fileType.fromBuffer(Body);
    if (!validMimeType(ContentType) || !validMimeType(mimeType.mime)) {
      throw new Error("Invalid upload mime type");
    } else {
      var getparams = {
        Bucket: bucket,
        Key: key,
      };
      const getresp = await s3.getObject(getparams).promise();
      const raw_img = getresp.Body;

      // const imageKey_md = `${image_id}_md.webp`
      // const imageKey_sm = `${image_id}_sm.webp`

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
            Key: imageKey,
            Body: webp_image,
            ContentType: "image/webp",
          })
          .promise()
      );

      // promises.push(s3.putObject({
      //   Bucket: VALID_BUCKET,
      //   Key: imageKey_md,
      //   Body: await sharp(webp_image)
      //     .resize(350, undefined, {
      //       fit: sharp.fit.cover,
      //     })
      //     .toBuffer(),
      //   ContentType: 'image/webp'
      // }).promise());

      // promises.push(s3.putObject({
      //   Bucket: VALID_BUCKET,
      //   Key: imageKey_sm,
      //   Body: await sharp(webp_image)
      //     .resize(200, 200, {
      //       fit: sharp.fit.cover,
      //     })
      //     .toBuffer(),
      //   ContentType: 'image/webp'
      // }).promise());

      await Promise.all(promises);
    }
  } catch (err) {
    return "Error validatingobject";
  }
};
