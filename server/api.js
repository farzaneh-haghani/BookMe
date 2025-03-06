import { Router } from "express";
import logger from "./utils/logger";
const dotenv = require("dotenv");
const { OAuth2Client } = require("google-auth-library");
const { Users, Provider, Tokens, Calendar } = require("./sequelize/models");
const { persistNewProvider } = require("./controller/apiController");

dotenv.config();

const router = Router();

router.get("/clientId", (_, res) => {
	try {
		const clientId = process.env.CLIENT_ID;
		if (!clientId) {
			throw new Error("Client ID not found.");
		}
		res.json({ clientId }).status(200);
	} catch (error) {
		logger.error("Error fetching clientId:", error.message);
		res.status(500).json({ error });
	}
});

router.post("/validation", async (req, res) => {
	const { token, role } = req.body;
	if (!token) {
		res.status(400).json({ error: "Missing token!" });
		return;
	}
	try {
		const client = new OAuth2Client();
		const ticket = await client.verifyIdToken({
			idToken: token,
			audience: process.env.CLIENT_ID,
		});
		const payload = ticket.getPayload();
		const { name, email } = payload;
		let user = await Users.findOne({ where: { email } });
		if (!user) {
			const newUser = await Users.create({ name, email, role });
			await Tokens.create({ token, user_id: newUser.id });
		} else {
			let currentToken = await Tokens.findOne({ where: { token } });
			if (!currentToken) {
				await Tokens.create({ token, user_id: user.id });
			}
		}
		res.status(200).json({ message: "success!" });
	} catch (error) {
		logger.error("Error: ", error.message);
		res.status(500).json({ message: "Invalid token!" });
	}
});

router.delete("/profile", async (req, res) => {
	try {
		const { token } = req.body;
		if (!token) {
			res.status(400).json({ error: "Missing token!" });
		} else {
			const latestToken = await Tokens.findOne({ where: { token } });
			if (!latestToken) {
				res.status(404).json({ error: "Token not found" });
			} else {
				await Tokens.destroy({ where: { user_id: latestToken.user_id } });
				await Users.destroy({ where: { id: latestToken.user_id } });
				const provider = await Provider.findOne({
					where: { user_id: latestToken.user_id },
				});
				if (provider) {
					await Provider.destroy({ where: { user_id: latestToken.user_id } });
					const calendarCode = await Calendar.findOne({
						where: { user_id: latestToken.user_id },
					});
					if (calendarCode) {
						await Calendar.destroy({ where: { user_id: latestToken.user_id } });
					}
				}
				res.status(200).json({ message: "Your account is deleted!" });
			}
		}
	} catch (error) {
		logger.error("Error: ", error.message);
		res.status(500).json({ error });
	}
});

router.post("/provider", async (req, res) => {
	const {
		firstName,
		lastName,
		email,
		businessName,
		profileImage,
		phoneNumber,
		address,
		city,
		country,
		profession,
		yearsOfExperience,
		hourlyRate,
		language,
	} = req.body;

	try {
		const user = await Users.findOne({ where: { email } });

		if (!user) {
			return res.status(400).json({ error: "User not found" });
		}

		const providerExists = await Provider.findOne({
			where: { user_id: user.id },
		});

		if (providerExists) {
			return res.status(400).json({ error: "User is already a Provider" });
		}

		const result = await persistNewProvider({
			user_id: user.id,
			firstName,
			lastName,
			email,
			businessName,
			profileImage,
			phoneNumber,
			address,
			city,
			country,
			profession,
			yearsOfExperience,
			hourlyRate,
			language,
		});

		res.status(201).json(result);
	} catch (error) {
		logger.error("Error: ", error.message);
		res.status(500).json({ error: error });
	}
});

router.get("/providers", async (_, res) => {
	try {
		const providers = await Provider.findAll({ include: Calendar });
		res.status(200).json(providers);
	} catch (error) {
		logger.error("Error: ", error.message);
		res.status(500).json(error);
	}
});

router.put("/provider", async (req, res) => {
	try {
		const {
			firstName,
			lastName,
			email,
			businessName,
			profileImage,
			phoneNumber,
			address,
			city,
			country,
			profession,
			yearsOfExperience,
			hourlyRate,
			language,
		} = req.body;
		const updatedProviderInfo = {
			firstName,
			lastName,
			email,
			businessName,
			profileImage,
			phoneNumber,
			address,
			city,
			country,
			profession,
			yearsOfExperience,
			hourlyRate,
			language,
		};
		const [count] = await Provider.update(updatedProviderInfo, {
			where: { email },
		});
		if (count === 1) {
			res.status(200).json({ message: "Your information updated!" });
		} else {
			res.status(404).json({ message: "Provider not found" });
		}
	} catch (error) {
		logger.error("Error: ", error.message);
		res.status(500).json({ error });
	}
});

router.post("/calendar", async (req, res) => {
	const { email, calendar_link } = req.body;
	if (!calendar_link) {
		res.status(400).json({ error: "Missing Calendar Link!" });
		return;
	}
	try {
		const provider = await Provider.findOne({ where: { email } });
		const providerCalendar = await Calendar.findOne({
			where: { provider_id: provider.id },
		});
		if (providerCalendar) {
			res.status(400).json({ error: "You Provided it before!" });
			return;
		}
		const calendar = await Calendar.create({
			calendar_link,
			provider_id: provider.id,
		});
		res.status(200).json({ message: "success", calendar });
	} catch (error) {
		logger.error("Error: ", error.message);
		res.status(500).json({ error });
	}
});

export default router;
