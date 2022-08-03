// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

library Pairing {
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {
        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return r the sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {
        uint256[4] memory input = [
            p1.X, p1.Y,
            p2.X, p2.Y
        ];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-add-failed");
    }

    /*
     * @return r the product of a point on G1 and a scalar, i.e.
     *         p == p.scalarMul(1) and p.plus(p) == p.scalarMul(2) for all
     *         points p.
     */
    function scalarMul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        uint256[3] memory input = [p.X, p.Y, s];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {
        uint256[24] memory input = [
            a1.X, a1.Y, a2.X[0], a2.X[1], a2.Y[0], a2.Y[1],
            b1.X, b1.Y, b2.X[0], b2.X[1], b2.Y[0], b2.Y[1],
            c1.X, c1.Y, c2.X[0], c2.X[1], c2.Y[0], c2.Y[1],
            d1.X, d1.Y, d2.X[0], d2.X[1], d2.Y[0], d2.Y[1]
        ];
        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 8, input, mul(24, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-opcode-failed");
        return out[0] != 0;
    }
}

contract Verifier {
    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    using Pairing for *;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[7] IC;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(uint256(14424978808313266837006947610673451613325429129698904142398055972752841248903), uint256(14846840010596941079159593289488833839436572023339876383222207216992731973838));
        vk.beta2 = Pairing.G2Point([uint256(8218568837321144353766922513719917569405285017022703816147730409554170187480), uint256(16317092633563869879695578171848883660824507443169179958790426158426541527752)], [uint256(14967870311072155583661378392995468715233643251773080980650936375827047427432), uint256(2190029845545839429369405061832237050769925274706431548456604417341807536511)]);
        vk.gamma2 = Pairing.G2Point([uint256(11246768825220137761384918709686069353949045621713816729119464289847147498703), uint256(4172166384557054891881429254605036800709388965656378622850487647633428882468)], [uint256(13901837205336532362328907882222139727726532020133275589055057241385363279438), uint256(8746323509326072727072222028618189817379841536507014949681771724374667914469)]);
        vk.delta2 = Pairing.G2Point([uint256(15920268422290081291917017086421280527322356502576055127241506405213087349662), uint256(14191654210901682764382203323055770996212476957188176378843863565420784110296)], [uint256(13291679248676727755729019488810774895280044950096553199892767413956339695398), uint256(12479071239838727860153523843917092082934556397614754645655257354885370804529)]);
        vk.IC[0] = Pairing.G1Point(uint256(6013419590722328245069537036778705312761917553688081046525979132172218305306), uint256(14935962936939953747057509344178099811255899215473441137004368774807808042302));
        vk.IC[1] = Pairing.G1Point(uint256(4663095113148306993846121125295516014174392090289138273515550441234294568668), uint256(16683456621299374226873999515827371221135977953178046608957551712661872268593));
        vk.IC[2] = Pairing.G1Point(uint256(10841471675784197305111061366870433455481070745770263744821130268472268933412), uint256(17671868120003945688075321012969317222278175143377829135363466584865565927064));
        vk.IC[3] = Pairing.G1Point(uint256(2212684939923470220202109532598172413949272431835548258102534112846556160614), uint256(13012498455111672071176456941069049718153497845775600087170188030296393117732));
        vk.IC[4] = Pairing.G1Point(uint256(17213093305027376851311458264547180662966704198997466622499408388163968714852), uint256(19881904657899648727834730319211276785491907548648143907952005288734500505200));
        vk.IC[5] = Pairing.G1Point(uint256(20883176197938291199940007016288108389166745893332000644873304895041019863779), uint256(19178668372914773137998562597592217900945629922589278319891484887934207607201));
        vk.IC[6] = Pairing.G1Point(uint256(665974695683511807609440185429812538515593278137462394751312765810091081133), uint256(11799244971683978087720486713745690915673863869693559867421192698425814291719));

    }

    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        bytes memory proof,
        uint256[6] memory input
    ) public view returns (bool) {
        uint256[8] memory p = abi.decode(proof, (uint256[8]));
        for (uint8 i = 0; i < p.length; i++) {
            // Make sure that each element in the proof is less than the prime q
            require(p[i] < PRIME_Q, "verifier-proof-element-gte-prime-q");
        }
        Pairing.G1Point memory proofA = Pairing.G1Point(p[0], p[1]);
        Pairing.G2Point memory proofB = Pairing.G2Point([p[2], p[3]], [p[4], p[5]]);
        Pairing.G1Point memory proofC = Pairing.G1Point(p[6], p[7]);

        VerifyingKey memory vk = verifyingKey();
        // Compute the linear combination vkX
        Pairing.G1Point memory vkX = vk.IC[0];
        for (uint256 i = 0; i < input.length; i++) {
            // Make sure that every input is less than the snark scalar field
            require(input[i] < SNARK_SCALAR_FIELD, "verifier-input-gte-snark-scalar-field");
            vkX = Pairing.plus(vkX, Pairing.scalarMul(vk.IC[i + 1], input[i]));
        }

        return Pairing.pairing(
            Pairing.negate(proofA),
            proofB,
            vk.alfa1,
            vk.beta2,
            vkX,
            vk.gamma2,
            proofC,
            vk.delta2
        );
    }
}

